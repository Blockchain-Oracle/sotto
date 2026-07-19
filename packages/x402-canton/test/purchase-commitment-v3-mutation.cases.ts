import { describe, expect, it, vi } from "vitest";
import {
  PURCHASE_COMMITMENT_VERSION,
  commitBoundedPurchase,
  readBoundedPurchaseLedgerIntent,
} from "../src/index.js";
import {
  createPackageSelectionFixture,
  createPurchaseV3Input,
  mutatePackageSelection,
  withPurchaseV3Clock,
} from "./purchase-package-selection.fixtures.js";
import {
  authenticInvalidSelections,
  structuralMutations,
} from "./purchase-commitment-v3-selection-mutations.js";

function continueToDownstream(
  input: ReturnType<typeof createPurchaseV3Input>,
  prepare: (value: unknown) => void,
  sign: (value: unknown) => void,
): void {
  const intent = readBoundedPurchaseLedgerIntent(
    commitBoundedPurchase(input as never),
  );
  prepare(intent);
  sign(intent);
}

export function registerPurchaseV3MutationCases(): void {
  describe.skipIf(String(PURCHASE_COMMITMENT_VERSION) !== "sotto-purchase-v3")(
    "sotto-purchase-v3 package-selection mutations",
    () => {
      it.each(structuralMutations)(
        "rejects %s before prepare or sign",
        async (_name, mutate) =>
          withPurchaseV3Clock(() => {
            const prepare = vi.fn();
            const sign = vi.fn();
            expect(() =>
              continueToDownstream(
                mutatePackageSelection(createPurchaseV3Input(), mutate),
                prepare,
                sign,
              ),
            ).toThrow();
            expect(prepare).not.toHaveBeenCalled();
            expect(sign).not.toHaveBeenCalled();
          }),
      );

      it.each(authenticInvalidSelections)(
        "rejects an authenticated %s scope mismatch before downstream",
        async (_name, mutate) =>
          withPurchaseV3Clock(() => {
            const prepare = vi.fn();
            const sign = vi.fn();
            const selection = createPackageSelectionFixture(undefined, mutate);
            expect(() =>
              continueToDownstream(
                createPurchaseV3Input(selection),
                prepare,
                sign,
              ),
            ).toThrow();
            expect(prepare).not.toHaveBeenCalled();
            expect(sign).not.toHaveBeenCalled();
          }),
      );

      it("binds otherwise identical genuine observation identities", async () =>
        withPurchaseV3Clock(() => {
          const first = commitBoundedPurchase(createPurchaseV3Input() as never);
          const second = commitBoundedPurchase(
            createPurchaseV3Input(
              createPackageSelectionFixture(`sha256:${"9".repeat(64)}`),
            ) as never,
          );
          expect(second.attemptId).not.toBe(first.attemptId);
          expect(second.commitment).not.toBe(first.commitment);
        }));

      it("accepts and binds a genuine in-window vetting time", async () =>
        withPurchaseV3Clock(() => {
          const first = commitBoundedPurchase(createPurchaseV3Input() as never);
          const selection = createPackageSelectionFixture(
            undefined,
            (value) => {
              value.vettingValidAt = "2026-07-13T10:00:31.000Z";
            },
          );
          const second = commitBoundedPurchase(
            createPurchaseV3Input(selection) as never,
          );
          expect(second.attemptId).not.toBe(first.attemptId);
          expect(second.commitment).not.toBe(first.commitment);
        }));

      it.each([
        ["purchase", { version: "sotto-purchase-v2" }],
        ["attempt", { attemptVersion: "sotto-payment-attempt-v2" }],
      ])(
        "rejects a caller-supplied v2 %s discriminator before downstream",
        async (_name, legacy) =>
          withPurchaseV3Clock(() => {
            const prepare = vi.fn();
            const sign = vi.fn();
            expect(() =>
              continueToDownstream(
                Object.assign(createPurchaseV3Input(), legacy),
                prepare,
                sign,
              ),
            ).toThrow();
            expect(prepare).not.toHaveBeenCalled();
            expect(sign).not.toHaveBeenCalled();
          }),
      );

      it("rejects a stale genuine selection before downstream calls", () => {
        vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
        try {
          const selection = createPackageSelectionFixture();
          vi.advanceTimersByTime(1);
          const input = createPurchaseV3Input(selection);
          vi.advanceTimersByTime(60_000);
          const prepare = vi.fn();
          const sign = vi.fn();
          expect(() => continueToDownstream(input, prepare, sign)).toThrow(
            /stale/u,
          );
          expect(prepare).not.toHaveBeenCalled();
          expect(sign).not.toHaveBeenCalled();
        } finally {
          vi.useRealTimers();
        }
      });

      it("rejects package-selection clock rollback before downstream calls", () => {
        vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
        try {
          const selection = createPackageSelectionFixture();
          vi.setSystemTime(new Date("2026-07-13T09:59:54.999Z"));
          const input = createPurchaseV3Input(selection);
          const prepare = vi.fn();
          const sign = vi.fn();
          expect(() => continueToDownstream(input, prepare, sign)).toThrow(
            /clock/u,
          );
          expect(prepare).not.toHaveBeenCalled();
          expect(sign).not.toHaveBeenCalled();
        } finally {
          vi.useRealTimers();
        }
      });
    },
  );
}
