import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanPayerIdentity,
  createHumanPayerIdentityObserver,
} from "../src/human-payer-identity.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;
const PARTY = `sotto-external-payer::${FINGERPRINT}`;

function identity() {
  return {
    keyPurpose: "SIGNING",
    network: "canton:devnet",
    party: PARTY,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
    publicKeyFingerprint: FINGERPRINT,
    signatureFormat: "SIGNATURE_FORMAT_CONCAT",
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
    synchronizerId: `global-domain::1220${"b".repeat(64)}`,
    topologyHash: `1220${"c".repeat(64)}`,
  };
}

function reader(candidate: unknown = identity()) {
  return {
    readAuthenticatedSubject: vi.fn(async () => "validator-devnet-m2m"),
    readPayerIdentity: vi.fn(async () => candidate),
  };
}

describe("human payer identity descriptor security", () => {
  beforeEach(() =>
    vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") }),
  );
  afterEach(() => vi.useRealTimers());

  it("rejects accessor-backed identity data without invocation", async () => {
    const candidate = identity();
    const readParty = vi.fn(() => PARTY);
    Object.defineProperty(candidate, "party", {
      enumerable: true,
      get: readParty,
    });

    await expect(
      createHumanPayerIdentityObserver(reader(candidate))(),
    ).rejects.toThrow(/payer identity.*failed|data properties/iu);
    expect(readParty).not.toHaveBeenCalled();
  });

  it("snapshots reader methods before later caller mutation", async () => {
    const source = reader();
    const readAuthenticatedSubject = source.readAuthenticatedSubject;
    const readPayerIdentity = source.readPayerIdentity;
    const observe = createHumanPayerIdentityObserver(source);
    const replacementSubject = vi.fn(async () => "attacker-subject");
    const replacementIdentity = vi.fn(async () => ({
      ...identity(),
      party: `sotto-attacker::1220${"f".repeat(64)}`,
    }));
    source.readAuthenticatedSubject = replacementSubject;
    source.readPayerIdentity = replacementIdentity;

    const observation = await observe();

    expect(claimHumanPayerIdentity(observation).party).toBe(PARTY);
    expect(readAuthenticatedSubject).toHaveBeenCalledTimes(2);
    expect(readPayerIdentity).toHaveBeenCalledOnce();
    expect(replacementSubject).not.toHaveBeenCalled();
    expect(replacementIdentity).not.toHaveBeenCalled();
  });
});
