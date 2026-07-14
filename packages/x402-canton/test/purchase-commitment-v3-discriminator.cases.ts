import { describe, expect, it } from "vitest";
import * as purchaseCommitment from "../src/purchase-commitment.js";
import { createPurchaseInput } from "./purchase-commitment.fixtures.js";

export function registerPurchaseV3DiscriminatorCases(): void {
  describe.skipIf(
    String(purchaseCommitment.PURCHASE_COMMITMENT_VERSION) !==
      "sotto-purchase-v3",
  )("sotto-purchase-v3 discriminators", () => {
    it("exports exact v3 purchase and attempt versions and rejects v2 input", () => {
      const subject = purchaseCommitment as unknown as {
        PURCHASE_COMMITMENT_VERSION: string;
        PURCHASE_ATTEMPT_VERSION: string;
      };
      expect(subject.PURCHASE_COMMITMENT_VERSION).toBe("sotto-purchase-v3");
      expect(subject.PURCHASE_ATTEMPT_VERSION).toBe(
        "sotto-purchase-attempt-v3",
      );
      expect(() =>
        purchaseCommitment.commitBoundedPurchase(createPurchaseInput()),
      ).toThrow(/package selection/u);
    });
  });
}
