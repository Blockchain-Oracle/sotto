import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
  readAuthenticatedHumanPackagePreference,
  readHumanPackagePreferenceAuthority,
} from "../src/human-package-preference-observation.js";
import { buildReviewedPackagePreferenceClosure } from "../src/package-preference-closure.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";
import { liveReferences } from "./package-preference-observation.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";
import { HUMAN_SYNCHRONIZER } from "./human-payer-identity.fixtures.js";
import { authenticatedHumanWalletPreflight } from "./human-wallet-connector-preflight.fixtures.js";

const VETTING = "2026-07-16T15:00:30.000Z";
const CHALLENGE_ID = `sha256:${"d".repeat(64)}` as const;

function closure() {
  const input = validClosureInput();
  input.artifacts = input.artifacts.filter(
    ({ name }) => name === "splice-amulet",
  );
  const ids = new Set(
    input.artifacts.flatMap(({ packages }) =>
      packages.map(({ packageId }) => packageId),
    ),
  );
  input.graphPackages = input.graphPackages.filter(({ packageId }) =>
    ids.has(packageId),
  );
  input.selectablePackageNames = ["splice-amulet"];
  return buildReviewedPackagePreferenceClosure(input);
}

function reader(expected = closure()) {
  return {
    readAuthenticatedSubject: vi.fn(async () => "validator-devnet-m2m"),
    readPackageReferences: vi.fn(async () => liveReferences(expected)),
  };
}

async function scope() {
  return {
    adminParty: DSO,
    challengeId: CHALLENGE_ID,
    challengeObservedAt: "2026-07-16T15:00:00.000Z",
    closure: closure(),
    executeBefore: "2026-07-16T15:10:00.000Z",
    providerParty: PROVIDER,
    vettingValidAt: VETTING,
    walletPreflight: await authenticatedHumanWalletPreflight(),
  };
}

describe("human package preference security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects a stale wallet preflight before package lookup", async () => {
    const candidateScope = await scope();
    candidateScope.vettingValidAt = "2026-07-16T15:02:00.000Z";
    const source = reader(candidateScope.closure);
    vi.advanceTimersByTime(60_001);

    await expect(
      createHumanPackagePreferenceObserver(source)(candidateScope),
    ).rejects.toThrow(/wallet connector preflight.*stale/iu);
    expect(source.readPackageReferences).not.toHaveBeenCalled();
  });

  it("redacts package and subject transport failures", async () => {
    for (const phase of ["packages", "subject"] as const) {
      const candidateScope = await scope();
      const source = reader(candidateScope.closure);
      const secret = `private-${phase}-token`;
      if (phase === "packages") {
        source.readPackageReferences.mockRejectedValue(new Error(secret));
      } else {
        source.readAuthenticatedSubject.mockRejectedValue(new Error(secret));
      }
      let failure: unknown;
      try {
        await createHumanPackagePreferenceObserver(source)(candidateScope);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(
        /package preference.*failed/iu,
      );
      expect((failure as Error).message).not.toContain(secret);
    }
  });

  it("enforces one deadline across trusted package reads", async () => {
    const candidateScope = await scope();
    let packageSignal: AbortSignal | undefined;
    const finalSubject = vi.fn(async () => "validator-devnet-m2m");
    const source = {
      readAuthenticatedSubject: vi
        .fn(async () => "validator-devnet-m2m")
        .mockImplementationOnce(async () => "validator-devnet-m2m")
        .mockImplementation(finalSubject),
      readPackageReferences: vi.fn(
        async (
          _request: unknown,
          options?: Readonly<{ signal: AbortSignal }>,
        ) => {
          packageSignal = options?.signal;
          return new Promise<never>(() => undefined);
        },
      ),
    };
    const pending = createHumanPackagePreferenceObserver(source)(
      candidateScope,
      { timeoutMilliseconds: 10 } as never,
    );
    let rejection: unknown;
    void pending.catch((error: unknown) => {
      rejection = error;
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(rejection).toEqual(
      new Error("human package preference deadline exceeded"),
    );
    expect(packageSignal?.aborted).toBe(true);
    expect(finalSubject).not.toHaveBeenCalled();
  });

  it("rejects invalid challenge timing and duplicate Parties", async () => {
    for (const mutate of [
      (value: Awaited<ReturnType<typeof scope>>) =>
        (value.challengeObservedAt = "2026-07-16T15:00:01.000Z"),
      (value: Awaited<ReturnType<typeof scope>>) =>
        (value.executeBefore = "2026-07-16T15:00:00.000Z"),
      (value: Awaited<ReturnType<typeof scope>>) =>
        (value.vettingValidAt = "2026-07-16T15:10:01.000Z"),
      (value: Awaited<ReturnType<typeof scope>>) => (value.providerParty = DSO),
    ]) {
      const candidateScope = await scope();
      mutate(candidateScope);
      await expect(
        createHumanPackagePreferenceObserver(reader())(candidateScope),
      ).rejects.toThrow();
    }
  });

  it("does not consume an observation on a mismatched claim", async () => {
    const candidateScope = await scope();
    const observation = await createHumanPackagePreferenceObserver(
      reader(candidateScope.closure),
    )(candidateScope);

    expect(() =>
      claimHumanPackagePreferenceObservation(observation, {
        ...candidateScope,
        challengeId: `sha256:${"e".repeat(64)}`,
      }),
    ).toThrow(/scope/iu);
    expect(() =>
      claimHumanPackagePreferenceObservation(observation, {
        ...candidateScope,
        providerParty: "sotto-other-provider::1220provider",
      }),
    ).toThrow(/scope/iu);
    const selection = claimHumanPackagePreferenceObservation(
      observation,
      candidateScope,
    );
    expect(readAuthenticatedHumanPackagePreference(selection)).toBe(selection);
    const authority = readHumanPackagePreferenceAuthority(selection);
    expect(authority.challengeId).toBe(CHALLENGE_ID);
    expect(authority.walletPreflight).toBe(candidateScope.walletPreflight);
    expect(authority.executeBefore).toBe(candidateScope.executeBefore);
    expect(selection.synchronizerId).toBe(HUMAN_SYNCHRONIZER);
    expect(Object.isFrozen(selection.references[0]?.artifactIds)).toBe(true);
  });
});
