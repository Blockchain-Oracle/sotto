import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPreferenceAwareCommand,
  commandPreferenceInputs,
} from "./bounded-purchase-command-preference.fixtures.js";
import { createPackageSelectionFixture } from "./purchase-package-selection.fixtures.js";

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function registerCommandPreferenceContractCases(): void {
  describe("exact command package preference RED contract", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("submits the exact non-empty unique lexical committed package IDs", async () => {
      const selection = createPackageSelectionFixture(
        undefined,
        (candidate) => {
          const first = candidate.references[0]!;
          const second = candidate.references[1]!;
          [first.packageId, second.packageId] = [
            second.packageId,
            first.packageId,
          ];
          candidate.packageIds.sort(utf8Compare);
        },
      );
      const { holdings, intent, packageSelection, registry } =
        await commandPreferenceInputs(selection);
      const expected = intent.packageSelection.references
        .map(({ packageId }) => packageId)
        .sort(utf8Compare);

      const request = buildPreferenceAwareCommand(
        intent,
        holdings,
        registry,
        packageSelection,
      );

      expect(
        intent.packageSelection.references.map(
          ({ packageName }) => packageName,
        ),
      ).toEqual(
        [...intent.packageSelection.references]
          .map(({ packageName }) => packageName)
          .sort(utf8Compare),
      );
      expect(
        intent.packageSelection.references.map(({ packageId }) => packageId),
      ).not.toEqual(expected);
      expect(request.packageIdSelectionPreference).toEqual(expected);
      expect(request.packageIdSelectionPreference).toEqual(
        intent.packageSelection.packageIds,
      );
      expect(request.packageIdSelectionPreference.length).toBeGreaterThan(0);
      expect(new Set(request.packageIdSelectionPreference).size).toBe(
        request.packageIdSelectionPreference.length,
      );
      expect(Object.isFrozen(request.packageIdSelectionPreference)).toBe(true);
    });
  });
}
