import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanPayerIdentity,
  createHumanPayerIdentityObserver,
  readAuthenticatedHumanPayerIdentity,
} from "../src/index.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;
const PARTY = `sotto-external-payer::${FINGERPRINT}`;
const SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;

function reader() {
  return {
    readAuthenticatedSubject: vi.fn(async () => "validator-devnet-m2m"),
    readPayerIdentity: vi.fn(async () => ({
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: PARTY,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      publicKeyFingerprint: FINGERPRINT,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      synchronizerId: SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
    })),
  };
}

describe("authenticated human payer identity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("captures one trusted zero-argument Five North payer identity", async () => {
    const source = reader();
    const observation = await createHumanPayerIdentityObserver(source)();
    const identity = claimHumanPayerIdentity(observation);

    expect(source.readPayerIdentity).toHaveBeenCalledWith();
    expect(identity).toEqual({
      acquiredAt: "2026-07-16T15:00:00.000Z",
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: PARTY,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      publicKeyFingerprint: FINGERPRINT,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      subjectHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      synchronizerId: SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
      version: "sotto-human-payer-identity-v1",
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(readAuthenticatedHumanPayerIdentity(identity)).toBe(identity);
  });

  it("rejects forged projections and one-use observation replay", async () => {
    const observation = await createHumanPayerIdentityObserver(reader())();
    const identity = claimHumanPayerIdentity(observation);

    expect(() =>
      readAuthenticatedHumanPayerIdentity(structuredClone(identity)),
    ).toThrow(/payer identity.*not authenticated/iu);
    expect(() => claimHumanPayerIdentity(observation)).toThrow(
      /payer identity.*already claimed/iu,
    );
  });

  it("rejects Party fingerprint substitution and subject changes", async () => {
    const wrongParty = reader();
    wrongParty.readPayerIdentity.mockResolvedValue({
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: `sotto-external-payer::1220${"d".repeat(64)}`,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      publicKeyFingerprint: FINGERPRINT,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      synchronizerId: SYNCHRONIZER,
      topologyHash: `1220${"c".repeat(64)}`,
    });
    await expect(
      createHumanPayerIdentityObserver(wrongParty)(),
    ).rejects.toThrow(/Party.*fingerprint/iu);

    const changedSubject = reader();
    changedSubject.readAuthenticatedSubject
      .mockResolvedValueOnce("validator-devnet-m2m")
      .mockResolvedValueOnce("substituted-subject");
    await expect(
      createHumanPayerIdentityObserver(changedSubject)(),
    ).rejects.toThrow(/authenticated subject changed/iu);
  });
});
