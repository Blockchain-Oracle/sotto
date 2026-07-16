import { describe, expect, it } from "vitest";
import {
  MAX_HUMAN_PURCHASE_CANONICAL_BYTES,
  encodeBoundedHumanPurchaseCanonical,
} from "../src/human-purchase-canonical.js";

describe("bounded human purchase canonical bytes", () => {
  it("accepts the exact byte ceiling and rejects plus one", () => {
    expect(
      encodeBoundedHumanPurchaseCanonical(
        "a".repeat(MAX_HUMAN_PURCHASE_CANONICAL_BYTES),
      ),
    ).toHaveLength(MAX_HUMAN_PURCHASE_CANONICAL_BYTES);
    expect(() =>
      encodeBoundedHumanPurchaseCanonical(
        "a".repeat(MAX_HUMAN_PURCHASE_CANONICAL_BYTES + 1),
      ),
    ).toThrow(/canonical.*32768 bytes/iu);
  });
});
