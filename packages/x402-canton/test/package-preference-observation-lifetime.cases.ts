import { describe, expect, it, vi } from "vitest";
import type { GetSubject } from "./package-preference-observation.harness.js";
import {
  reader,
  withObservedClock,
} from "./package-preference-observation.harness.js";
import {
  claimScope,
  liveReferences,
  OBSERVED_AT,
  observationClosure,
  observationScope,
  SUBJECT,
  VETTING_VALID_AT,
} from "./package-preference-observation.fixtures.js";

export function registerPackagePreferenceLifetimeCases(
  getSubject: GetSubject,
): void {
  describe("package-preference observation lifetime", () => {
    it.each([
      ["slow acquisition", 10_001],
      ["acquisition clock rollback", -5_001],
    ])("rejects %s", async (_label, delta) => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        await expect(
          getSubject().createPackagePreferenceObserver(
            reader(liveReferences(closure), [], undefined, () => {
              vi.setSystemTime(Date.now() + delta);
            }),
          )(observationScope(closure)),
        ).rejects.toThrow();
      });
    });

    it.each([
      ["stale", 60_001, {}],
      ["clock rollback", -5_001, {}],
      ["vetting mismatch", 0, { vettingValidAt: "2026-07-14T10:00:31.000Z" }],
      ["synchronizer mismatch", 0, { synchronizerId: "other-sync" }],
      ["subject mismatch", 0, { authenticatedSubject: "other-subject" }],
    ])("rejects %s claim", async (_label, delta, override) => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const observation = await getSubject().createPackagePreferenceObserver(
          reader(liveReferences(closure)),
        )(observationScope(closure));
        vi.setSystemTime(Date.now() + delta);
        expect(() =>
          getSubject().claimPackagePreferenceObservation(observation, {
            ...claimScope(closure),
            ...override,
          }),
        ).toThrow();
      });
    });

    it("claims one immutable projection exactly once", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const observation = await getSubject().createPackagePreferenceObserver(
          reader(liveReferences(closure)),
        )(observationScope(closure));
        const projection = getSubject().claimPackagePreferenceObservation(
          observation,
          claimScope(closure),
        );
        expect(projection).toMatchObject({
          version: "sotto-package-selection-v1",
          vettingValidAt: VETTING_VALID_AT,
          acquiredAt: OBSERVED_AT,
          authenticatedSubject: SUBJECT,
        });
        expect(Object.isFrozen(projection)).toBe(true);
        expect(() =>
          getSubject().claimPackagePreferenceObservation(
            observation,
            claimScope(closure),
          ),
        ).toThrow();
        expect(() =>
          getSubject().claimPackagePreferenceObservation(
            { ...observation },
            claimScope(closure),
          ),
        ).toThrow();
      });
    });
  });
}
