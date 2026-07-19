import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
  readAuthenticatedHumanPackagePreference,
} from "../src/index.js";
import { buildReviewedPackagePreferenceClosure } from "../src/package-preference-closure.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";
import { liveReferences } from "./package-preference-observation.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";
import {
  HUMAN_PAYER,
  HUMAN_SYNCHRONIZER,
} from "./human-payer-identity.fixtures.js";
import { authenticatedHumanWalletPreflight } from "./human-wallet-connector-preflight.fixtures.js";

const VETTING_VALID_AT = "2026-07-16T15:00:30.000Z";
const CHALLENGE_ID = `sha256:${"d".repeat(64)}` as const;

function humanClosure() {
  const input = validClosureInput();
  input.artifacts = input.artifacts.filter(
    ({ name }) => name === "splice-amulet",
  );
  const packageIds = new Set(
    input.artifacts.flatMap(({ packages }) =>
      packages.map(({ packageId }) => packageId),
    ),
  );
  input.graphPackages = input.graphPackages.filter(({ packageId }) =>
    packageIds.has(packageId),
  );
  input.selectablePackageNames = ["splice-amulet"];
  return buildReviewedPackagePreferenceClosure(input);
}

function reader(closure = humanClosure()) {
  return {
    readAuthenticatedSubject: vi.fn(async () => "validator-devnet-m2m"),
    readPackageReferences: vi.fn(async () => liveReferences(closure)),
  };
}

async function scope(closure = humanClosure()) {
  return {
    adminParty: DSO,
    challengeId: CHALLENGE_ID,
    challengeObservedAt: "2026-07-16T15:00:00.000Z",
    closure,
    executeBefore: "2026-07-16T15:10:00.000Z",
    providerParty: PROVIDER,
    vettingValidAt: VETTING_VALID_AT,
    walletPreflight: await authenticatedHumanWalletPreflight(),
  };
}

describe("human Token-only package preference", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("requests only splice-amulet for payer provider and admin", async () => {
    const closure = humanClosure();
    const source = reader(closure);
    const expectedScope = await scope(closure);
    const observation =
      await createHumanPackagePreferenceObserver(source)(expectedScope);
    const selection = claimHumanPackagePreferenceObservation(
      observation,
      expectedScope,
    );

    expect(source.readPackageReferences).toHaveBeenCalledWith(
      {
        packageRequirements: [
          {
            packageName: "splice-amulet",
            parties: [DSO, HUMAN_PAYER, PROVIDER].sort(),
          },
        ],
        synchronizerId: HUMAN_SYNCHRONIZER,
        vettingValidAt: VETTING_VALID_AT,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(selection.version).toBe("sotto-human-package-selection-v1");
    expect(selection.references).toHaveLength(1);
    expect(selection.references[0]?.packageName).toBe("splice-amulet");
    expect(selection.packageIds).toEqual([selection.references[0]?.packageId]);
    expect(selection.parties).toEqual([DSO, HUMAN_PAYER, PROVIDER].sort());
    expect(JSON.stringify(selection)).not.toMatch(/agent|sotto-control/iu);
    expect(readAuthenticatedHumanPackagePreference(selection)).toBe(selection);
  });

  it("rejects structural clones and observation replay", async () => {
    const expectedScope = await scope();
    const observation =
      await createHumanPackagePreferenceObserver(reader())(expectedScope);
    const selection = claimHumanPackagePreferenceObservation(
      observation,
      expectedScope,
    );

    expect(() =>
      readAuthenticatedHumanPackagePreference(structuredClone(selection)),
    ).toThrow(/human package preference.*not authenticated/iu);
    expect(() =>
      claimHumanPackagePreferenceObservation(observation, expectedScope),
    ).toThrow(/human package preference.*already claimed/iu);
  });

  it("rejects capability closures and forged wallet preflights", async () => {
    const capabilityClosure =
      buildReviewedPackagePreferenceClosure(validClosureInput());
    const capabilityScope = await scope(capabilityClosure);
    const capabilityReader = reader(capabilityClosure);
    await expect(
      createHumanPackagePreferenceObserver(capabilityReader)(capabilityScope),
    ).rejects.toThrow(/exactly splice-amulet/iu);
    expect(capabilityReader.readPackageReferences).not.toHaveBeenCalled();

    const validScope = await scope();
    await expect(
      createHumanPackagePreferenceObserver(reader())({
        ...validScope,
        walletPreflight: structuredClone(validScope.walletPreflight),
      }),
    ).rejects.toThrow(/wallet connector preflight.*not authenticated/iu);
  });
});
