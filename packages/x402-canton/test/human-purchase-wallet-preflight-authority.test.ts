import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
} from "../src/human-package-preference-observation.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import { liveReferences } from "./package-preference-observation.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";
import {
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_PURCHASE_EXPIRES_AT,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
  humanPackageClosure,
  humanWalletIdentity,
} from "./human-purchase-commitment.fixtures.js";
import { humanPreflightInput } from "./human-wallet-connector-preflight.fixtures.js";

describe("human purchase requires one wallet preflight authority", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("scopes package selection and commitment to the same preflight", async () => {
    const base = await createHumanPurchaseInput();
    const walletPreflight = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    if (walletPreflight.outcome !== "compatible") {
      throw new Error("test wallet is incompatible");
    }
    const closure = humanPackageClosure();
    const scope = {
      adminParty: DSO,
      challengeId: base.paymentObservation.challengeId,
      challengeObservedAt: base.paymentObservation.observedAt,
      closure,
      executeBefore: HUMAN_PURCHASE_EXPIRES_AT,
      providerParty: PROVIDER,
      vettingValidAt: "2026-07-16T15:00:30.000Z",
      walletPreflight,
    };
    const observation = await createHumanPackagePreferenceObserver({
      readAuthenticatedSubject: async () => "validator-devnet-m2m",
      readPackageReferences: async () => liveReferences(closure),
    })(scope as never);
    const packageSelection = claimHumanPackagePreferenceObservation(
      observation,
      scope as never,
    );

    expect(() =>
      commitHumanPurchaseForTest(
        {
          maximumFeeAtomic: base.maximumFeeAtomic,
          packageSelection,
          paymentObservation: base.paymentObservation,
          walletPreflight,
        } as never,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        `${HUMAN_AUTHORIZATION_INSTANCE_ID}-preflight`,
      ),
    ).not.toThrow();
    const { walletPreflight: legacyPreflight, ...legacy } = base;
    expect(() =>
      commitHumanPurchaseForTest(
        {
          ...legacy,
          payerIdentity: humanWalletIdentity(legacyPreflight),
        } as never,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        `${HUMAN_AUTHORIZATION_INSTANCE_ID}-legacy`,
      ),
    ).toThrow(/input keys/iu);
  });
});
