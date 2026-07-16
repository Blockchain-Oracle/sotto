import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import { readAuthenticatedHumanPayerIdentity } from "../src/human-payer-identity.js";
import {
  commitHumanPurchaseForTest,
  type HumanPurchaseTrustedConfiguration,
} from "../src/human-purchase-commitment.js";
import {
  readAuthenticatedHumanPurchaseLedgerIntent,
  readHumanPurchaseLedgerIntent,
} from "../src/human-purchase-ledger-intent.js";
import {
  HUMAN_PURCHASE_EXPIRES_AT,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
  type HumanChallengeFixture,
} from "./human-purchase-commitment.fixtures.js";
import { RESOURCE_URL } from "./purchase-commitment.fixtures.js";

let authorizationIndex = 0;

async function committed(
  options: Parameters<typeof createHumanPurchaseInput>[0] = {},
  config: HumanPurchaseTrustedConfiguration = HUMAN_TOKEN_FACTORY_CONFIGURATION,
) {
  const input = await createHumanPurchaseInput(options);
  const commitment = commitHumanPurchaseForTest(
    input,
    config,
    `human-intent-security-${++authorizationIndex}`,
  );
  return { commitment, input };
}

describe("human Ledger intent provenance and privacy", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects forged and hostile commitment wrappers before property access", async () => {
    const { commitment } = await committed();
    const trapped = new Proxy(commitment, {
      get: () => {
        throw new Error("private commitment getter");
      },
      ownKeys: () => {
        throw new Error("private commitment keys");
      },
    });
    const hostileGetter = Object.defineProperty({}, "canonicalBytes", {
      get: () => {
        throw new Error("private synthetic bytes");
      },
    });
    for (const candidate of [
      { ...commitment },
      structuredClone(commitment),
      Object.create(commitment),
      trapped,
      hostileGetter,
    ]) {
      expect(() => readHumanPurchaseLedgerIntent(candidate as never)).toThrow(
        /^human purchase commitment is not authenticated$/u,
      );
    }
  });

  it("caches one intent but never bypasses source mutation detection", async () => {
    const { commitment } = await committed();
    const intent = readHumanPurchaseLedgerIntent(commitment);
    const serialized = JSON.stringify(intent);

    expect(readHumanPurchaseLedgerIntent(commitment)).toBe(intent);
    commitment.canonicalBytes[0] = commitment.canonicalBytes[0]! ^ 1;
    expect(() => readHumanPurchaseLedgerIntent(commitment)).toThrow(
      /mutated/iu,
    );
    expect(JSON.stringify(intent)).toBe(serialized);
    expect(readAuthenticatedHumanPurchaseLedgerIntent(intent)).toBe(intent);
  });

  it("rejects forged intent wrappers and standalone identity authority", async () => {
    const { commitment } = await committed();
    const intent = readHumanPurchaseLedgerIntent(commitment);
    const trapped = new Proxy(intent, {
      get: () => {
        throw new Error("private intent getter");
      },
    });
    for (const candidate of [
      structuredClone(intent),
      Object.create(intent),
      trapped,
    ]) {
      expect(() =>
        readAuthenticatedHumanPurchaseLedgerIntent(candidate),
      ).toThrow(/^human purchase Ledger intent is not authenticated$/u);
    }
    expect(() =>
      readAuthenticatedHumanPayerIdentity(intent.payerIdentity),
    ).toThrow(/not authenticated/iu);
  });

  it("does not expose raw request, challenge, or authorization material", async () => {
    const privateUrl = `${RESOURCE_URL}&access_token=private-intent-query`;
    const { commitment } = await committed({
      mutateChallenge: (challenge) => {
        challenge.resource.url = privateUrl;
      },
      request: {
        body: new TextEncoder().encode("private intent body"),
        headers: [["idempotency-key", "private intent header"]],
        method: "POST",
        url: privateUrl,
      },
    });
    const serialized = JSON.stringify(
      readHumanPurchaseLedgerIntent(commitment),
    );

    for (const forbidden of [
      "private-intent-query",
      "private intent body",
      "private intent header",
      "canonicalBytes",
      "authorizationInstanceId",
      "observationId",
      "challengeBytes",
      "paymentObservation",
      "capability",
      "allowance",
      "agentParty",
      "policy",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects self-consistent non-CC and non-Amulet rails", async () => {
    const mutations: ReadonlyArray<
      readonly [string, (challenge: HumanChallengeFixture) => void]
    > = [
      ["OtherCoin", (challenge) => (challenge.accepts[0]!.asset = "OtherCoin")],
      [
        "OtherInstrument",
        (challenge) => {
          challenge.accepts[0]!.extra.instrumentId.id = "OtherInstrument";
        },
      ],
    ];
    for (const [replacement, mutateChallenge] of mutations) {
      const config = {
        ...HUMAN_TOKEN_FACTORY_CONFIGURATION,
        ...(replacement === "OtherCoin"
          ? { expectedAsset: replacement }
          : { expectedInstrumentId: replacement }),
      };
      const { commitment } = await committed({ mutateChallenge }, config);
      expect(() => readHumanPurchaseLedgerIntent(commitment)).toThrow(
        /discriminator/iu,
      );
    }
  });

  it("accepts zero fees and creates distinct intents for fresh purchases", async () => {
    const first = await committed({ maximumFeeAtomic: "0" });
    const second = await committed();
    const firstIntent = readHumanPurchaseLedgerIntent(first.commitment);
    const secondIntent = readHumanPurchaseLedgerIntent(second.commitment);

    expect(firstIntent.limits).toEqual({
      maximumFeeAtomic: "0",
      maximumTotalDebitAtomic: firstIntent.challenge.amountAtomic,
    });
    expect(secondIntent).not.toBe(firstIntent);
    expect(secondIntent.attemptId).not.toBe(firstIntent.attemptId);
  });

  it("remains an authenticated historical projection after expiry", async () => {
    const { commitment } = await committed();
    vi.advanceTimersByTime(60_001);
    const intent = readHumanPurchaseLedgerIntent(commitment);
    vi.setSystemTime(new Date(Date.parse(HUMAN_PURCHASE_EXPIRES_AT) + 60_000));

    expect(readHumanPurchaseLedgerIntent(commitment)).toBe(intent);
  });

  it("keeps internal authenticity and command authority readers private", () => {
    expect(publicApi).not.toHaveProperty(
      "readAuthenticatedHumanPurchaseLedgerIntent",
    );
    expect(publicApi).not.toHaveProperty("readHumanPurchaseCommandAuthority");
  });
});
