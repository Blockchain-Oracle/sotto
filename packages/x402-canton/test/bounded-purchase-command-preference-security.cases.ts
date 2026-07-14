import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedPackagePreferenceProjection } from "../src/index.js";
import { readPurchaseHoldingObservation } from "../src/purchase-holding-observation.js";
import { readTransferFactoryObservation } from "../src/transfer-factory-observation.js";
import {
  buildPreferenceAwareCommand,
  commandPreferenceInputs,
  executionFor,
} from "./bounded-purchase-command-preference.fixtures.js";
import { createPackageSelectionFixture } from "./purchase-package-selection.fixtures.js";

type CandidateFactory = (
  original: AuthenticatedPackagePreferenceProjection,
) => AuthenticatedPackagePreferenceProjection;

const invalidCandidates: ReadonlyArray<readonly [string, CandidateFactory]> = [
  [
    "empty structural clone",
    (original) =>
      ({
        ...structuredClone(original),
        packageIds: [],
      }) as unknown as AuthenticatedPackagePreferenceProjection,
  ],
  [
    "reordered authenticated IDs",
    () =>
      createPackageSelectionFixture(undefined, (selection) => {
        selection.packageIds.reverse();
      }) as unknown as AuthenticatedPackagePreferenceProjection,
  ],
  [
    "missing authenticated ID",
    () =>
      createPackageSelectionFixture(undefined, (selection) => {
        selection.packageIds.pop();
      }) as unknown as AuthenticatedPackagePreferenceProjection,
  ],
  [
    "extra authenticated ID",
    () =>
      createPackageSelectionFixture(undefined, (selection) => {
        selection.packageIds.push("f".repeat(64));
      }) as unknown as AuthenticatedPackagePreferenceProjection,
  ],
  [
    "duplicate authenticated ID",
    () =>
      createPackageSelectionFixture(undefined, (selection) => {
        selection.packageIds[1] = selection.packageIds[0]!;
      }) as unknown as AuthenticatedPackagePreferenceProjection,
  ],
  [
    "separately authenticated identical selection",
    () =>
      createPackageSelectionFixture() as unknown as AuthenticatedPackagePreferenceProjection,
  ],
];

export function registerCommandPreferenceSecurityCases(): void {
  describe("exact command package preference security RED contract", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each(invalidCandidates)(
      "rejects %s before consuming execution observations",
      async (_name, candidate) => {
        const { holdings, intent, packageSelection, registry } =
          await commandPreferenceInputs();

        expect(() =>
          buildPreferenceAwareCommand(
            intent,
            holdings,
            registry,
            candidate(packageSelection),
          ),
        ).toThrow();
        expect(() =>
          readPurchaseHoldingObservation(holdings, intent),
        ).not.toThrow();
        expect(() =>
          readTransferFactoryObservation(registry, intent, holdings),
        ).not.toThrow();
        expect(
          buildPreferenceAwareCommand(
            intent,
            holdings,
            registry,
            packageSelection,
          ).packageIdSelectionPreference,
        ).toEqual(intent.packageSelection.packageIds);
      },
    );

    it("rejects a stale committed selection before construction", async () => {
      const { intent, packageSelection } = await commandPreferenceInputs(
        createPackageSelectionFixture(),
        600,
      );
      vi.advanceTimersByTime(60_001);
      const { holdings, registry } = await executionFor(intent);

      expect(() =>
        buildPreferenceAwareCommand(
          intent,
          holdings,
          registry,
          packageSelection,
        ),
      ).toThrow(/package.*stale/iu);
      expect(() =>
        readPurchaseHoldingObservation(holdings, intent),
      ).not.toThrow();
      expect(() =>
        readTransferFactoryObservation(registry, intent, holdings),
      ).not.toThrow();
    });

    it("claims the committed selection exactly once", async () => {
      const { holdings, intent, packageSelection, registry } =
        await commandPreferenceInputs();
      buildPreferenceAwareCommand(intent, holdings, registry, packageSelection);
      const second = await executionFor(intent);

      expect(() =>
        buildPreferenceAwareCommand(
          intent,
          second.holdings,
          second.registry,
          packageSelection,
        ),
      ).toThrow(/package.*already claimed/iu);
      expect(() =>
        readPurchaseHoldingObservation(second.holdings, intent),
      ).not.toThrow();
      expect(() =>
        readTransferFactoryObservation(
          second.registry,
          intent,
          second.holdings,
        ),
      ).not.toThrow();
    });
  });
}
