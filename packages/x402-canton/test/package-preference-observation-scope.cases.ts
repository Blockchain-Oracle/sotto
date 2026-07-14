import { describe, expect, it } from "vitest";
import type {
  GetSubject,
  ReadRequest,
} from "./package-preference-observation.harness.js";
import {
  reader,
  withObservedClock,
} from "./package-preference-observation.harness.js";
import {
  claimScope,
  liveReferences,
  observationClosure,
  observationScope,
  oneNameClosure,
  PARTIES,
  SUBJECT,
  SYNCHRONIZER,
  VETTING_VALID_AT,
} from "./package-preference-observation.fixtures.js";

export function registerPackagePreferenceScopeCases(
  getSubject: GetSubject,
): void {
  describe("package-preference observation scope", () => {
    it("reads the exact two-name, party, synchronizer, and vetting scope", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const requests: ReadRequest[] = [];
        const observe = getSubject().createPackagePreferenceObserver(
          reader(liveReferences(closure), requests),
        );
        const observation = await observe(observationScope(closure));
        expect(requests).toEqual([
          {
            packageRequirements: ["sotto-control", "splice-amulet"].map(
              (packageName) => ({ packageName, parties: PARTIES }),
            ),
            synchronizerId: SYNCHRONIZER,
            vettingValidAt: VETTING_VALID_AT,
          },
        ]);
        expect(Object.keys(observation).sort()).toEqual([
          "observationId",
          "observedAt",
        ]);
        expect(JSON.stringify(observation)).not.toContain(SUBJECT);
      });
    });

    it("canonicalizes response ordering and snapshots caller-owned values", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const values = liveReferences(closure).reverse();
        const scope = observationScope(closure);
        const observation = await getSubject().createPackagePreferenceObserver(
          reader(values),
        )(scope);
        values[0]!.packageName = "mutated";
        scope.synchronizerId = "mutated";
        const projection = getSubject().claimPackagePreferenceObservation(
          observation,
          claimScope(closure),
        );
        expect(
          projection.references.map(({ packageName }) => packageName),
        ).toEqual(["sotto-control", "splice-amulet"]);
        expect(projection.packageIds).toEqual(
          [...projection.packageIds].sort(),
        );
        expect(projection.parties).toEqual(PARTIES);
        expect(projection.synchronizerId).toBe(SYNCHRONIZER);
      });
    });

    it("rejects a closure that is not the exact reviewed two-name scope", async () => {
      await withObservedClock(async () => {
        const closure = oneNameClosure();
        await expect(
          getSubject().createPackagePreferenceObserver(
            reader(liveReferences(closure)),
          )(observationScope(closure)),
        ).rejects.toThrow();
      });
    });

    it.each(["missing", "extra", "duplicate", "metadata"])(
      "rejects %s response authority",
      async (mutation) => {
        await withObservedClock(async () => {
          const closure = observationClosure();
          const values = liveReferences(closure);
          if (mutation === "missing") values.pop();
          if (mutation === "extra") {
            const extra = closure.graphPackages.find(
              ({ name }) => name === "daml-prim",
            )!;
            values.push({
              packageId: extra.packageId,
              packageName: extra.name,
              packageVersion: extra.version,
            });
          }
          if (mutation === "duplicate") values.push(values[0]!);
          if (mutation === "metadata") values[0]!.packageVersion = "wrong";
          await expect(
            getSubject().createPackagePreferenceObserver(reader(values))(
              observationScope(closure),
            ),
          ).rejects.toThrow();
        });
      },
    );

    it("rejects a token subject that changes during acquisition", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        await expect(
          getSubject().createPackagePreferenceObserver(
            reader(liveReferences(closure), [], [SUBJECT, "changed-subject"]),
          )(observationScope(closure)),
        ).rejects.toThrow();
      });
    });
  });
}
