import { Client } from "pg";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
  purchaseBindingResolver,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  restorePurchasePrepareAuthorityForTest,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";
import { freshHumanPrepareAuthority } from "./purchase-prepare-authority.fixture.js";
let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;
beforeAll(async () => {
  context = await createPurchaseTestRuntime(
    "sotto_purchase_authority_security",
  );
});
afterAll(async () => context?.database.drop());
afterEach(() => vi.restoreAllMocks());

function repository(marker = 7, keyId = "prepare-key-2026-07") {
  return context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(
      context.runtime,
      marker,
      keyId,
    ),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
}
function restore(
  attemptId: `sha256:${string}`,
  resolve: Parameters<typeof restorePurchasePrepareAuthorityForTest>[3],
  marker = 7,
  keyId = "prepare-key-2026-07",
) {
  return restorePurchasePrepareAuthorityForTest(
    context.database.databaseUrl,
    testPrepareAuthorityKeyring(context.runtime, marker, keyId),
    attemptId,
    resolve,
  );
}

async function mutate(sql: string, attemptId: string): Promise<void> {
  const client = new Client({ connectionString: context.database.databaseUrl });
  await client.connect();
  try {
    await client.query(sql, [attemptId]);
  } finally {
    await client.end();
  }
}

it("protects ready authority and never heals an explicitly quarantined job", async () => {
  const intent = await catalogHumanPurchaseIntent();
  const purchase = repository();
  try {
    const created = await purchase.initializeHumanPurchaseAttempt(intent);
    await expect(
      mutate(
        "DELETE FROM sotto.private_prepare_authorities WHERE attempt_id = $1",
        created.attemptId,
      ),
    ).rejects.toMatchObject({
      code: "23001",
      constraint: "outbox_jobs_prepare_authority_fk",
    });
    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await mutate(
      "DELETE FROM sotto.outbox_jobs WHERE attempt_id = $1",
      created.attemptId,
    );
    await mutate(
      "DELETE FROM sotto.private_prepare_authorities WHERE attempt_id = $1",
      created.attemptId,
    );
    await expect(
      purchase.initializeHumanPurchaseAttempt(intent),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    await expect(
      restore(created.attemptId, () => freshHumanPrepareAuthority(intent)),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "PURCHASE_PERSISTENCE",
        message: "purchase persistence failed",
      }),
    );
  } finally {
    await purchase.close();
  }
});

it("hides wrong and unavailable keys behind the repository error", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 599;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 599;
  });
  const first = repository();
  const created = await first.initializeHumanPurchaseAttempt(intent);
  await first.close();
  for (const [marker, keyId] of [
    [8, "prepare-key-2026-07"],
    [8, "other-key"],
  ] as const) {
    await expect(
      restore(
        created.attemptId,
        () => freshHumanPrepareAuthority(intent),
        marker,
        keyId,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "PURCHASE_PERSISTENCE",
        message: "purchase persistence failed",
      }),
    );
  }
});

it("rejects ciphertext corruption before resolving wallet authority", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 598;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 598;
  });
  const purchase = repository();
  const resolve = vi.fn(() => freshHumanPrepareAuthority(intent));
  try {
    const created = await purchase.initializeHumanPurchaseAttempt(intent);
    await mutate(
      `UPDATE sotto.private_prepare_authorities
       SET ciphertext = set_byte(ciphertext, 0, get_byte(ciphertext, 0) # 1)
       WHERE attempt_id = $1`,
      created.attemptId,
    );
    await expect(restore(created.attemptId, resolve)).rejects.toMatchObject({
      code: "PURCHASE_PERSISTENCE",
    });
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    await purchase.close();
  }
});

it("rejects trusted drift without poisoning a later exact restore", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 597;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 597;
  });
  const purchase = repository();
  try {
    const created = await purchase.initializeHumanPurchaseAttempt(intent);
    await expect(
      restore(created.attemptId, async () => {
        const fresh = await freshHumanPrepareAuthority(intent);
        return {
          ...fresh,
          trustedConfiguration: {
            ...fresh.trustedConfiguration,
            contractId: "00wrong-factory",
          },
        };
      }),
    ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    await expect(
      restore(created.attemptId, () => freshHumanPrepareAuthority(intent)),
    ).resolves.toMatchObject({ purchaseCommitment: intent.purchaseCommitment });
  } finally {
    await purchase.close();
  }
});

it("rejects an exhausted signing reserve before fresh authority reads", async () => {
  const intent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = 595;
    challenge.accepts[0]!.extra.executeBeforeSeconds = 595;
  });
  const purchase = repository();
  const resolve = vi.fn(() => freshHumanPrepareAuthority(intent));
  try {
    const created = await purchase.initializeHumanPurchaseAttempt(intent);
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse(intent.challenge.executeBefore) - 119_999,
    );
    await expect(restore(created.attemptId, resolve)).rejects.toMatchObject({
      code: "PURCHASE_PERSISTENCE",
    });
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    await purchase.close();
  }
});
