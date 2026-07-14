import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  commitBoundedPurchase,
  readBoundedPurchaseLedgerIntent,
  type AuthenticatedPackagePreferenceProjection,
} from "../src/index.js";
import { readPurchaseHoldingObservation } from "../src/purchase-holding-observation.js";
import { readTransferFactoryObservation } from "../src/transfer-factory-observation.js";
import {
  buildPreferenceAwareCommand,
  executionFor,
} from "./bounded-purchase-command-preference.fixtures.js";
import { createPurchaseInput } from "./purchase-commitment.fixtures.js";
import { createPackageSelectionFixture } from "./purchase-package-selection.fixtures.js";

export function registerCommandAuthoritySecurityCases(): void {
  describe("command package authority isolation", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("does not expose mutable package authority through the public API", () => {
      expect(publicApi).not.toHaveProperty(
        "readBoundedPurchasePackageSelectionAuthority",
      );
    });

    it("binds one authenticated selection to one purchase identity", () => {
      const packageSelection = createPackageSelectionFixture();
      commitBoundedPurchase(createPurchaseInput(packageSelection));

      expect(() =>
        commitBoundedPurchase({
          ...createPurchaseInput(packageSelection),
          authorizationInstanceId: "authorization-8",
        }),
      ).toThrow(/package.*already bound/iu);
    });

    it("shares one command claim across idempotent commitments", async () => {
      const packageSelection = createPackageSelectionFixture();
      const input = createPurchaseInput(packageSelection);
      const firstIntent = readBoundedPurchaseLedgerIntent(
        commitBoundedPurchase(input),
      );
      const retryIntent = readBoundedPurchaseLedgerIntent(
        commitBoundedPurchase({ ...input }),
      );
      const first = await executionFor(firstIntent);
      const retry = await executionFor(retryIntent);
      buildPreferenceAwareCommand(
        firstIntent,
        first.holdings,
        first.registry,
        packageSelection as unknown as AuthenticatedPackagePreferenceProjection,
      );

      expect(() =>
        buildPreferenceAwareCommand(
          retryIntent,
          retry.holdings,
          retry.registry,
          packageSelection as unknown as AuthenticatedPackagePreferenceProjection,
        ),
      ).toThrow(/package.*already claimed/iu);
      expect(() =>
        readPurchaseHoldingObservation(retry.holdings, retryIntent),
      ).not.toThrow();
      expect(() =>
        readTransferFactoryObservation(
          retry.registry,
          retryIntent,
          retry.holdings,
        ),
      ).not.toThrow();
    });
  });
}
