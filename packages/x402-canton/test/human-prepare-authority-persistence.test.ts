import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import { projectHumanPurchaseJournalIntent } from "../src/human-purchase-journal-intent.js";
import {
  exportHumanPrepareAuthorityPlaintext,
  parseHumanPrepareAuthorityPlaintext,
  readHumanPrepareAuthorityRestoreScope,
  restoreHumanPrepareAuthority,
} from "../src/human-prepare-authority-persistence.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { readHumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import {
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPackageSelection,
  createHumanPurchaseInput,
  type HumanPurchaseFixtureOptions,
} from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_CONNECTOR_ID,
  HUMAN_CONNECTOR_ORIGIN,
  HUMAN_PACKAGE_ID,
  authenticatedHumanWalletPreflight,
} from "./human-wallet-connector-preflight.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";

let authorizationSequence = 0;

async function persistedAuthority(options: HumanPurchaseFixtureOptions = {}) {
  const input = await createHumanPurchaseInput(options);
  const original = readHumanPurchaseLedgerIntent(
    commitHumanPurchaseForTest(
      input,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      `${HUMAN_AUTHORIZATION_INSTANCE_ID}-${authorizationSequence++}`,
    ),
  );
  return {
    bytes: exportHumanPrepareAuthorityPlaintext(original),
    input,
    original,
  };
}

async function freshAuthorities(
  fixture: Awaited<ReturnType<typeof persistedAuthority>>,
) {
  const walletPreflight = await authenticatedHumanWalletPreflight();
  const packageSelection = await createHumanPackageSelection(
    walletPreflight,
    fixture.input.paymentObservation,
    DSO,
    PROVIDER,
    fixture.original.challenge.executeBefore,
  );
  return {
    packageSelection,
    trustedConfiguration: HUMAN_TOKEN_FACTORY_CONFIGURATION,
    walletPreflight,
  };
}

describe("human prepare authority persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps prepare-authority plaintext APIs off the public package root", () => {
    expect(publicApi).not.toHaveProperty(
      "exportHumanPrepareAuthorityPlaintext",
    );
    expect(publicApi).not.toHaveProperty("parseHumanPrepareAuthorityPlaintext");
    expect(publicApi).not.toHaveProperty("restoreHumanPrepareAuthority");
  });

  it("restores the exact intent with fresh wallet and package observations", async () => {
    const fixture = await persistedAuthority();
    const { bytes, original } = fixture;
    expect(bytes.byteLength).toBeLessThanOrEqual(196_608);
    const authenticated = parseHumanPrepareAuthorityPlaintext(bytes);
    const scope = readHumanPrepareAuthorityRestoreScope(authenticated);
    expect(scope).toMatchObject({
      attemptId: original.attemptId,
      challenge: {
        adminParty: original.challenge.instrument.admin,
        challengeId: original.challenge.challengeId,
        executeBefore: original.challenge.executeBefore,
        observedAt: original.challenge.requestedAt,
        payerParty: original.challenge.payerParty,
        providerParty: original.challenge.recipientParty,
        synchronizerId: original.challenge.synchronizerId,
      },
      connector: {
        connectorId: HUMAN_CONNECTOR_ID,
        origin: HUMAN_CONNECTOR_ORIGIN,
        expectedPackageId: HUMAN_PACKAGE_ID,
      },
      purchaseCommitment: original.purchaseCommitment,
      trustedConfiguration: HUMAN_TOKEN_FACTORY_CONFIGURATION,
    });
    expect(Object.isFrozen(scope)).toBe(true);

    vi.advanceTimersByTime(1_000);
    const fresh = await freshAuthorities(fixture);
    expect(fresh.packageSelection.acquiredAt).not.toBe(
      original.packageSelection.acquiredAt,
    );

    const restored = restoreHumanPrepareAuthority(authenticated, fresh);

    expect(restored).toEqual(original);
    expect(projectHumanPurchaseJournalIntent(restored)).toEqual(
      projectHumanPurchaseJournalIntent(original),
    );
    expect(() =>
      projectHumanPurchaseJournalIntent(structuredClone(restored)),
    ).toThrow(/not authenticated/iu);
    expect(() => restoreHumanPrepareAuthority(authenticated, fresh)).toThrow(
      /already claimed/iu,
    );

    const retryHandle = parseHumanPrepareAuthorityPlaintext(bytes);
    vi.advanceTimersByTime(1);
    const retry = restoreHumanPrepareAuthority(
      retryHandle,
      await freshAuthorities(fixture),
    );

    expect(retry).toEqual(original);
  });

  it("rejects unauthenticated handles and configuration drift", async () => {
    const fixture = await persistedAuthority();
    const handle = parseHumanPrepareAuthorityPlaintext(fixture.bytes);
    const fresh = await freshAuthorities(fixture);

    expect(() =>
      exportHumanPrepareAuthorityPlaintext({ ...fixture.original }),
    ).toThrow(/not authenticated/iu);
    expect(() =>
      restoreHumanPrepareAuthority({ ...handle } as never, fresh),
    ).toThrow(/not authenticated/iu);
    expect(() =>
      restoreHumanPrepareAuthority(handle, {
        ...fresh,
        trustedConfiguration: {
          ...HUMAN_TOKEN_FACTORY_CONFIGURATION,
          maximumAllowedFeeAtomic: "1000000001",
        },
      }),
    ).toThrow(/configuration does not match/iu);
  });

  it("enforces the 120 second signing reserve after restoration", async () => {
    const fixture = await persistedAuthority({
      mutateChallenge: (challenge) => {
        challenge.accepts[0]!.maxTimeoutSeconds = 121;
        challenge.accepts[0]!.extra.executeBeforeSeconds = 121;
      },
    });
    const handle = parseHumanPrepareAuthorityPlaintext(fixture.bytes);
    vi.advanceTimersByTime(2_000);
    const fresh = await freshAuthorities(fixture);

    expect(() => restoreHumanPrepareAuthority(handle, fresh)).toThrow(
      /signing reserve/iu,
    );
  });
});
