import { describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import * as packagePreferenceObservation from "../src/package-preference-observation.js";
import {
  PURCHASE_COMMITMENT_VERSION,
  commitBoundedPurchase,
  readBoundedPurchaseLedgerIntent,
} from "../src/index.js";
import { createPurchaseInput } from "./purchase-commitment.fixtures.js";
import {
  createPurchaseV3Input,
  expectedCanonicalPackageSelection,
  rawPackageSelection,
  withPurchaseV3Clock,
} from "./purchase-package-selection.fixtures.js";
import { claimProductionPackageSelection } from "./purchase-package-selection-production.fixture.js";

export function registerPurchaseLedgerIntentV3Cases(): void {
  describe.skipIf(String(PURCHASE_COMMITMENT_VERSION) !== "sotto-purchase-v3")(
    "sotto-purchase-v3 Ledger intent",
    () => {
      it("projects one deeply frozen authenticated package selection", async () =>
        withPurchaseV3Clock(() => {
          const input = createPurchaseV3Input();
          const intent = readBoundedPurchaseLedgerIntent(
            commitBoundedPurchase(input as never),
          ) as unknown as {
            version: string;
            packageSelection: ReturnType<
              typeof expectedCanonicalPackageSelection
            >;
          };
          const selection = intent.packageSelection;
          expect(intent.version).toBe("sotto-purchase-v3");
          expect(selection).toEqual(
            expectedCanonicalPackageSelection(input.packageSelection),
          );
          expect(Object.isFrozen(selection)).toBe(true);
          expect(Object.isFrozen(selection.requirements)).toBe(true);
          for (const requirement of selection.requirements) {
            expect(Object.isFrozen(requirement)).toBe(true);
            expect(Object.isFrozen(requirement.parties)).toBe(true);
          }
          expect(Object.isFrozen(selection.references)).toBe(true);
          for (const reference of selection.references) {
            expect(Object.isFrozen(reference)).toBe(true);
            expect(Object.isFrozen(reference.artifactIds)).toBe(true);
          }
          expect(Object.isFrozen(selection.packageIds)).toBe(true);
          expect(Object.isFrozen(selection.parties)).toBe(true);
        }));

      it("binds a real observer claim and rejects its structural clone", async () =>
        withPurchaseV3Clock(async () => {
          const { observationId, projection } =
            await claimProductionPackageSelection();
          expect(projection.observationId).toBe(observationId);
          const intent = readBoundedPurchaseLedgerIntent(
            commitBoundedPurchase(createPurchaseV3Input(projection) as never),
          ) as unknown as {
            packageSelection: { observationId: string; closureHash: string };
          };
          expect(intent.packageSelection.observationId).toBe(observationId);
          expect(intent.packageSelection.closureHash).toBe(
            projection.closureHash,
          );

          const prepare = vi.fn();
          const sign = vi.fn();
          expect(() => {
            const cloned = structuredClone(projection);
            const forged = readBoundedPurchaseLedgerIntent(
              commitBoundedPurchase(createPurchaseV3Input(cloned) as never),
            );
            prepare(forged);
            sign(forged);
          }).toThrow(/authenticated/u);
          expect(prepare).not.toHaveBeenCalled();
          expect(sign).not.toHaveBeenCalled();
        }));

      it("keeps the projection recorder outside the public API and test-only", () => {
        expect(
          Object.hasOwn(publicApi, "capturePackagePreferenceProjectionForTest"),
        ).toBe(false);
        const record = (
          packagePreferenceObservation as unknown as {
            capturePackagePreferenceProjectionForTest?: (
              input: unknown,
            ) => unknown;
          }
        ).capturePackagePreferenceProjectionForTest;
        expect(record).toBeTypeOf("function");
        vi.stubEnv("NODE_ENV", "production");
        try {
          expect(() => record?.(rawPackageSelection())).toThrow(/test-only/u);
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it("rejects the legacy v2-shaped input before downstream calls", async () =>
        withPurchaseV3Clock(() => {
          const prepare = vi.fn();
          const sign = vi.fn();
          const { packageSelection: _selection, ...legacy } =
            createPurchaseInput();
          void _selection;
          expect(() => {
            const intent = readBoundedPurchaseLedgerIntent(
              commitBoundedPurchase(legacy as never),
            );
            prepare(intent);
            sign(intent);
          }).toThrow(/input keys|package selection/u);
          expect(prepare).not.toHaveBeenCalled();
          expect(sign).not.toHaveBeenCalled();
        }));
    },
  );
}
