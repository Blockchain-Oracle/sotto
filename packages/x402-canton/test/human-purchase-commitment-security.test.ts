import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAuthenticHumanPurchase,
  createHumanPurchaseCommitter,
} from "../src/index.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import {
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import { authenticatedHumanWalletPreflight } from "./human-wallet-connector-preflight.fixtures.js";
let nonceIndex = 0;
function nonce(label: string): string {
  nonceIndex += 1;
  return `${label}-${nonceIndex}`;
}
describe("human purchase commitment provenance and replay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });
  afterEach(() => vi.useRealTimers());
  it("rejects cloned authorities without consuming the genuine artifacts", async () => {
    const input = await createHumanPurchaseInput();
    for (const forged of [
      { ...input, walletPreflight: structuredClone(input.walletPreflight) },
      { ...input, packageSelection: structuredClone(input.packageSelection) },
      {
        ...input,
        paymentObservation: structuredClone(input.paymentObservation),
      },
    ]) {
      expect(() =>
        commitHumanPurchaseForTest(
          forged as never,
          HUMAN_TOKEN_FACTORY_CONFIGURATION,
          nonce("forged-authority"),
        ),
      ).toThrow(/not authenticated/iu);
    }
    expect(() =>
      commitHumanPurchaseForTest(
        input,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        nonce("genuine-authority"),
      ),
    ).not.toThrow();
  });

  it("rejects caller-injected authority fields before binding", async () => {
    const input = await createHumanPurchaseInput();
    for (const [field, value] of [
      ["authorizationInstanceId", "caller-nonce"],
      ["expectedNetwork", "canton:other"],
      ["maximumTotalDebitAtomic", "9999999999"],
      ["tokenFactory", { contractId: "caller-factory" }],
      ["capability", { contractId: "caller-capability" }],
      ["agentParty", "sotto-agent::caller"],
    ] as const) {
      expect(() =>
        commitHumanPurchaseForTest(
          { ...input, [field]: value } as never,
          HUMAN_TOKEN_FACTORY_CONFIGURATION,
          nonce(`caller-${field}`),
        ),
      ).toThrow(/input keys/iu);
    }

    expect(() =>
      commitHumanPurchaseForTest(
        input,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        nonce("caller-clean"),
      ),
    ).not.toThrow();
  });

  it("generates an internal nonce and binds all authorities once", async () => {
    const input = await createHumanPurchaseInput();
    const commit = createHumanPurchaseCommitter(
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
    );
    const result = commit(input);
    const canonical = JSON.parse(
      new TextDecoder().decode(result.canonicalBytes),
    ) as { authorizationInstanceId: string };

    expect(canonical.authorizationInstanceId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(() => assertAuthenticHumanPurchase(result)).not.toThrow();
    expect(() => commit(input)).toThrow(/authority.*already bound/iu);
  });

  it("rejects a reused nonce without consuming fresh artifacts", async () => {
    const first = await createHumanPurchaseInput();
    const second = await createHumanPurchaseInput();
    const reused = nonce("reused-nonce");
    commitHumanPurchaseForTest(
      first,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      reused,
    );

    expect(() =>
      commitHumanPurchaseForTest(
        second,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        reused,
      ),
    ).toThrow(/authority.*already bound/iu);
    expect(() =>
      commitHumanPurchaseForTest(
        second,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        nonce("fresh-after-reuse"),
      ),
    ).not.toThrow();
  });

  it("binds an authenticated wallet preflight to only one purchase", async () => {
    const walletPreflight = await authenticatedHumanWalletPreflight();
    const first = await createHumanPurchaseInput({ walletPreflight });
    const second = await createHumanPurchaseInput({ walletPreflight });
    commitHumanPurchaseForTest(
      first,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      nonce("identity-first"),
    );

    expect(() =>
      commitHumanPurchaseForTest(
        second,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        nonce("identity-second"),
      ),
    ).toThrow(/wallet connector preflight.*already bound/iu);
  });

  it("detects forged results and canonical-byte mutation", async () => {
    const result = commitHumanPurchaseForTest(
      await createHumanPurchaseInput(),
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      nonce("result-authenticity"),
    );
    expect(() => assertAuthenticHumanPurchase(structuredClone(result))).toThrow(
      /not authenticated/iu,
    );
    result.canonicalBytes[0] = result.canonicalBytes[0]! ^ 1;
    expect(() => assertAuthenticHumanPurchase(result)).toThrow(/mutated/iu);
  });

  it("binds the exact authenticated artifacts from one root snapshot", async () => {
    const input = await createHumanPurchaseInput();
    const fake = Object.freeze({});
    let preflightReads = 0;
    let packageReads = 0;
    let paymentReads = 0;
    const accessorInput = Object.defineProperties(
      {},
      {
        maximumFeeAtomic: {
          enumerable: true,
          get: () => input.maximumFeeAtomic,
        },
        packageSelection: {
          enumerable: true,
          get: () => (++packageReads === 1 ? input.packageSelection : fake),
        },
        walletPreflight: {
          enumerable: true,
          get: () => (++preflightReads === 1 ? input.walletPreflight : fake),
        },
        paymentObservation: {
          enumerable: true,
          get: () => (++paymentReads <= 6 ? input.paymentObservation : fake),
        },
      },
    );

    const result = commitHumanPurchaseForTest(
      accessorInput as never,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      nonce("accessor-snapshot"),
    );

    expect(result.challengeId).toBe(input.paymentObservation.challengeId);
    expect({ packageReads, paymentReads, preflightReads }).toEqual({
      packageReads: 1,
      paymentReads: 1,
      preflightReads: 1,
    });
    expect(() =>
      commitHumanPurchaseForTest(
        input,
        HUMAN_TOKEN_FACTORY_CONFIGURATION,
        nonce("accessor-replay"),
      ),
    ).toThrow(/authority.*already bound/iu);
  });
});
