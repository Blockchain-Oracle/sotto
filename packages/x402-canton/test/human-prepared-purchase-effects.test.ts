import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  rootOnlyHumanPreparedPurchaseBytes,
} from "./human-prepared-purchase.fixtures.js";

describe("human prepared transfer effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the complete payer-authorized Token transfer graph", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const shape = inspectHumanPreparedPurchaseStructure(
      humanPreparedPurchaseBytes(intent, request),
      intent,
      request,
    );

    expect(shape.nodeCount).toBe(14);
    expect(shape.inputContractCount).toBe(5);
    expect(shape.nodeKinds).toEqual({ exercise: 5, create: 2, fetch: 7 });
  });

  it("rejects the legacy root-only transaction", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();

    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        rootOnlyHumanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).toThrow(/prepared.*effect/iu);
  });
});
