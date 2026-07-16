import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanPayerIdentity,
  createHumanPayerIdentityObserver,
} from "../src/human-payer-identity.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;
const PARTY = `sotto-external-payer::${FINGERPRINT}`;
const SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;

function identity() {
  return {
    network: "canton:devnet",
    party: PARTY,
    publicKeyFingerprint: FINGERPRINT,
    synchronizerId: SYNCHRONIZER,
    topologyHash: `1220${"c".repeat(64)}`,
  };
}

function reader(candidate: unknown = identity()) {
  return {
    readAuthenticatedSubject: vi.fn(async () => "validator-devnet-m2m"),
    readPayerIdentity: vi.fn(async () => candidate),
  };
}

describe("human payer identity security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("redacts private upstream failures", async () => {
    for (const phase of ["subject", "topology"] as const) {
      const source = reader();
      const secret = `private-${phase}-token`;
      if (phase === "subject") {
        source.readAuthenticatedSubject.mockRejectedValue(new Error(secret));
      } else {
        source.readPayerIdentity.mockRejectedValue(new Error(secret));
      }

      let failure: unknown;
      try {
        await createHumanPayerIdentityObserver(source)();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/payer identity.*failed/iu);
      expect((failure as Error).message).not.toContain(secret);
    }
  });

  it("rejects acquisition overrun, stale claims, and clock rollback", async () => {
    const delayed = reader();
    delayed.readPayerIdentity.mockImplementation(async () => {
      vi.advanceTimersByTime(10_001);
      return identity();
    });
    await expect(createHumanPayerIdentityObserver(delayed)()).rejects.toThrow(
      /stale/iu,
    );

    vi.setSystemTime(new Date("2026-07-16T15:00:00.000Z"));
    const stale = await createHumanPayerIdentityObserver(reader())();
    vi.advanceTimersByTime(60_001);
    expect(() => claimHumanPayerIdentity(stale)).toThrow(/stale/iu);

    vi.setSystemTime(new Date("2026-07-16T15:00:00.000Z"));
    const rollback = await createHumanPayerIdentityObserver(reader())();
    vi.setSystemTime(new Date("2026-07-16T14:59:54.999Z"));
    expect(() => claimHumanPayerIdentity(rollback)).toThrow(/clock/iu);
  });

  it.each([
    ["extra member", { ...identity(), extra: true }],
    ["wrong network", { ...identity(), network: "eip155:8453" }],
    ["empty Canton network", { ...identity(), network: "canton:" }],
    ["non-Sotto Party", { ...identity(), party: `payer::${FINGERPRINT}` }],
    [
      "uppercase fingerprint",
      { ...identity(), publicKeyFingerprint: FINGERPRINT.toUpperCase() },
    ],
    ["blank synchronizer", { ...identity(), synchronizerId: "" }],
    ["blank topology hash", { ...identity(), topologyHash: "" }],
  ])("rejects %s", async (_name, candidate) => {
    await expect(
      createHumanPayerIdentityObserver(reader(candidate))(),
    ).rejects.toThrow();
  });

  it("snapshots the response and never exposes the raw subject", async () => {
    const candidate = identity();
    const observation = await createHumanPayerIdentityObserver(
      reader(candidate),
    )();
    candidate.party = `sotto-external-payer::1220${"d".repeat(64)}`;
    const claimed = claimHumanPayerIdentity(observation);

    expect(claimed.party).toBe(PARTY);
    expect(JSON.stringify({ observation, claimed })).not.toContain(
      "validator-devnet-m2m",
    );
    expect(Object.keys(observation).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
  });
});
