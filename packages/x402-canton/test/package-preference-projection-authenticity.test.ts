import { describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  capturePackagePreferenceProjectionForTest,
  claimPackagePreferenceObservation,
  createPackagePreferenceObserver,
  readAuthenticatedPackagePreferenceProjection,
} from "../src/package-preference-observation.js";
import {
  claimScope,
  liveReferences,
  observationClosure,
  observationScope,
} from "./package-preference-observation.fixtures.js";
import { reader } from "./package-preference-observation.harness.js";
import {
  rawPackageSelection,
  withPurchaseV3Clock,
} from "./purchase-package-selection.fixtures.js";

function expectDeeplyFrozen(
  selection: ReturnType<typeof readAuthenticatedPackagePreferenceProjection>,
): void {
  expect(Object.isFrozen(selection)).toBe(true);
  expect(Object.isFrozen(selection.references)).toBe(true);
  for (const reference of selection.references) {
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.artifactIds)).toBe(true);
  }
  expect(Object.isFrozen(selection.packageIds)).toBe(true);
  expect(Object.isFrozen(selection.parties)).toBe(true);
}

async function claimRealProjection() {
  const closure = observationClosure();
  const observation = await createPackagePreferenceObserver(
    reader(liveReferences(closure)),
  )(observationScope(closure));
  return {
    observation,
    projection: claimPackagePreferenceObservation(
      observation,
      claimScope(closure),
    ),
  };
}

describe("package-preference projection authenticity", () => {
  it("binds a real claim to its observation and permits repeated fresh reads", async () =>
    withPurchaseV3Clock(async () => {
      const { observation, projection } = await claimRealProjection();
      expect(projection.observationId).toBe(observation.observationId);
      const first = readAuthenticatedPackagePreferenceProjection(projection);
      const second = readAuthenticatedPackagePreferenceProjection(projection);
      expect(first).toEqual(second);
      expect(first.observationId).toBe(observation.observationId);
      expectDeeplyFrozen(first);
      expectDeeplyFrozen(second);
    }));

  it("rejects structural clones of a real claimed projection", async () =>
    withPurchaseV3Clock(async () => {
      const { projection } = await claimRealProjection();
      expect(() =>
        readAuthenticatedPackagePreferenceProjection(
          structuredClone(projection),
        ),
      ).toThrow(/not authenticated/u);
    }));

  it("measures read freshness from the original acquisition", async () =>
    withPurchaseV3Clock(async () => {
      const { projection } = await claimRealProjection();
      vi.advanceTimersByTime(60_000);
      expect(() =>
        readAuthenticatedPackagePreferenceProjection(projection),
      ).not.toThrow();
      vi.advanceTimersByTime(1);
      expect(() =>
        readAuthenticatedPackagePreferenceProjection(projection),
      ).toThrow(/stale/u);
    }));

  it("keeps its guarded recorder outside the public package API", async () =>
    withPurchaseV3Clock(() => {
      expect(
        Object.hasOwn(publicApi, "capturePackagePreferenceProjectionForTest"),
      ).toBe(false);
      const input = rawPackageSelection();
      const recorded = capturePackagePreferenceProjectionForTest(input);
      input.references[0]!.artifactIds[0] = "mutated";
      const read = readAuthenticatedPackagePreferenceProjection(recorded);
      expect(read.references[0]!.artifactIds[0]).not.toBe("mutated");
      expectDeeplyFrozen(read);

      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() =>
          capturePackagePreferenceProjectionForTest(rawPackageSelection()),
        ).toThrow(/test-only/u);
      } finally {
        vi.unstubAllEnvs();
      }
    }));
});
