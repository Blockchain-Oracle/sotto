import { describe, expect, it } from "vitest";
import type { GetSubject } from "./package-preference-observation.harness.js";
import {
  reader,
  withObservedClock,
} from "./package-preference-observation.harness.js";
import {
  claimScope,
  historicalSiblingClosure,
  liveReferences,
  observationClosure,
  observationScope,
  PARTIES,
  SUBJECT,
  SYNCHRONIZER,
  VETTING_VALID_AT,
} from "./package-preference-observation.fixtures.js";

export function registerPackagePreferenceAuthorityCases(
  getSubject: GetSubject,
): void {
  describe("package-preference observation authority scope", () => {
    it("requires exactly one reviewed ID for each required package name", async () => {
      await withObservedClock(async () => {
        const closure = historicalSiblingClosure();
        const sameNameReferences = closure.graphPackages
          .filter(({ name }) => name === "splice-amulet")
          .map(({ packageId, name: packageName, version: packageVersion }) => ({
            packageId,
            packageName,
            packageVersion,
          }));
        await expect(
          getSubject().createPackagePreferenceObserver(
            reader(sameNameReferences),
          )(observationScope(closure)),
        ).rejects.toThrow();
      });
    });

    it("snapshots the complete authority scope before asynchronous reads", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const scope = observationScope(closure);
        const observation = await getSubject().createPackagePreferenceObserver(
          reader(liveReferences(closure), [], undefined, () => {
            scope.closure = historicalSiblingClosure();
            scope.synchronizerId = "mutated-sync";
            scope.vettingValidAt = "2026-07-14T10:00:31.000Z";
            scope.payerParty = "mutated-payer";
            scope.agentParty = "mutated-agent";
            scope.providerParty = "mutated-provider";
            scope.adminParty = "mutated-admin";
          }),
        )(scope);
        const projection = getSubject().claimPackagePreferenceObservation(
          observation,
          claimScope(closure),
        );
        expect(projection).toMatchObject({
          closureHash: closure.closureHash,
          parties: PARTIES,
          synchronizerId: SYNCHRONIZER,
          vettingValidAt: VETTING_VALID_AT,
          authenticatedSubject: SUBJECT,
        });
      });
    });

    it("creates unique opaque SHA-256 observation IDs", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const observe = () =>
          getSubject().createPackagePreferenceObserver(
            reader(liveReferences(closure)),
          )(observationScope(closure));
        const first = await observe();
        const second = await observe();
        expect(first.observationId).toMatch(/^sha256:[a-f0-9]{64}$/u);
        expect(second.observationId).not.toBe(first.observationId);
      });
    });

    it.each<readonly [string, unknown]>([
      ["absent", undefined],
      ["empty", ""],
      ["non-string", 7],
      ["non-canonical", " subject "],
    ])(
      "rejects a stable but %s authenticated subject",
      async (_label, value) => {
        await withObservedClock(async () => {
          const closure = observationClosure();
          await expect(
            getSubject().createPackagePreferenceObserver(
              reader(liveReferences(closure), [], [value, value]),
            )(observationScope(closure)),
          ).rejects.toThrow();
        });
      },
    );

    it("rejects a claim made with a different reviewed closure", async () => {
      await withObservedClock(async () => {
        const closure = observationClosure();
        const observation = await getSubject().createPackagePreferenceObserver(
          reader(liveReferences(closure)),
        )(observationScope(closure));
        expect(() =>
          getSubject().claimPackagePreferenceObservation(
            observation,
            claimScope(historicalSiblingClosure()),
          ),
        ).toThrow();
      });
    });
  });
}
