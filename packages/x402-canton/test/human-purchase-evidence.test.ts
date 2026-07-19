import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAuthenticHumanPurchase,
  createHumanPurchaseEvidence,
  type HumanPurchaseCommitment,
} from "../src/index.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import {
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_PURCHASE_EXPIRES_AT,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_PAYER,
  HUMAN_PAYER_FINGERPRINT,
  HUMAN_SYNCHRONIZER,
} from "./human-payer-identity.fixtures.js";
import { DSO, PROVIDER, RESOURCE_URL } from "./purchase-commitment.fixtures.js";

const privateUrl = `${RESOURCE_URL}&access_token=private-query-token`;
let commitmentIndex = 0;

async function privateCommitment(): Promise<HumanPurchaseCommitment> {
  const input = await createHumanPurchaseInput({
    mutateChallenge: (challenge) => {
      challenge.resource.url = privateUrl;
    },
    request: {
      body: new TextEncoder().encode('{"prompt":"private Kigali weather"}'),
      headers: [
        ["content-type", "application/json"],
        ["idempotency-key", "private-human-attempt"],
      ],
      method: "POST",
      url: privateUrl,
    },
  });
  return commitHumanPurchaseForTest(
    input,
    HUMAN_TOKEN_FACTORY_CONFIGURATION,
    `${HUMAN_AUTHORIZATION_INSTANCE_ID}-${++commitmentIndex}`,
  );
}

describe("policy-free human purchase evidence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("projects only the immutable public hash allowlist", async () => {
    const commitment = await privateCommitment();
    const evidence = createHumanPurchaseEvidence(commitment);

    expect(evidence).toEqual({
      attemptId: commitment.attemptId,
      authorizationMode: "human-wallet",
      challengeId: commitment.challengeId,
      purchaseCommitment: commitment.commitment,
      requestCommitment: commitment.requestCommitment,
      version: commitment.version,
    });
    expect(Object.keys(evidence).sort()).toEqual(
      [
        "attemptId",
        "authorizationMode",
        "challengeId",
        "purchaseCommitment",
        "requestCommitment",
        "version",
      ].sort(),
    );
    expect(Object.isFrozen(evidence)).toBe(true);
    for (const descriptor of Object.values(
      Object.getOwnPropertyDescriptors(evidence),
    )) {
      expect(descriptor).toMatchObject({
        configurable: false,
        writable: false,
      });
    }

    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      "private Kigali weather",
      "private-query-token",
      "private-human-attempt",
      "provider.example",
      HUMAN_PAYER,
      HUMAN_PAYER_FINGERPRINT,
      HUMAN_SYNCHRONIZER,
      PROVIDER,
      DSO,
      "00tokenfactory7",
      "Amulet",
      HUMAN_AUTHORIZATION_INSTANCE_ID,
      "canonicalBytes",
      "bodyHash",
      "expiresAt",
      "publicKeyFingerprint",
      "topologyHash",
      "subjectHash",
      "packageSelection",
      "maximumTotalDebitAtomic",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(() => assertAuthenticHumanPurchase(evidence)).toThrow(
      /not authenticated/iu,
    );
  });

  it("rejects forged or wrapped commitments without invoking hostile traps", async () => {
    const commitment = await privateCommitment();
    const trapped = new Proxy(commitment, {
      get: () => {
        throw new Error("private getter value");
      },
      ownKeys: () => {
        throw new Error("private key value");
      },
    });
    const hostileGetter = Object.defineProperty({}, "attemptId", {
      enumerable: true,
      get: () => {
        throw new Error("private synthetic value");
      },
    });
    for (const forged of [
      structuredClone(commitment),
      Object.create(commitment),
      trapped,
      hostileGetter,
    ]) {
      expect(() => createHumanPurchaseEvidence(forged as never)).toThrow(
        /^human purchase commitment is not authenticated$/u,
      );
    }
  });

  it("does not alias canonical bytes and detects later source mutation", async () => {
    const commitment = await privateCommitment();
    const evidence = createHumanPurchaseEvidence(commitment);
    const serialized = JSON.stringify(evidence);

    commitment.canonicalBytes[0] = commitment.canonicalBytes[0]! ^ 1;
    expect(JSON.stringify(evidence)).toBe(serialized);
    expect(() => createHumanPurchaseEvidence(commitment)).toThrow(/mutated/iu);
  });

  it("remains repeatable historical evidence after purchase expiry", async () => {
    const commitment = await privateCommitment();
    const first = createHumanPurchaseEvidence(commitment);
    vi.setSystemTime(new Date(Date.parse(HUMAN_PURCHASE_EXPIRES_AT) + 60_000));

    expect(createHumanPurchaseEvidence(commitment)).toEqual(first);
    expect(createHumanPurchaseEvidence(commitment)).not.toBe(first);
  });
});
