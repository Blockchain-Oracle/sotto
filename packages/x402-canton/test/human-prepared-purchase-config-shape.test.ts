import { describe, expect, it } from "vitest";
import { selectHumanTransferConfigShape } from "../src/human-prepared-purchase-config-shape.js";
import { FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID } from "../src/purchase-holding-types.js";
import {
  fixtureRecord,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";

const SELECTED_PACKAGE_ID =
  "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f";
const BASE_FIELDS = [
  "holdingFee",
  "maxNumInputs",
  "maxNumOutputs",
  "maxNumLockHolders",
];

function valueWithTokenTtl(packageId: string) {
  return fixtureRecord(`${packageId}:Test:Config`, [
    ["tokenStandardMaxTTL", fixtureScalar("text", "present")],
  ]);
}

describe("human transfer config shape", () => {
  it("gives historical identity precedence when selected overlaps it", () => {
    expect(
      selectHumanTransferConfigShape(
        valueWithTokenTtl(FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID),
        FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
        FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
      ),
    ).toEqual({ fields: BASE_FIELDS, hasTokenTtl: false });
  });

  it.each([
    ["historical", FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID, undefined],
    ["selected", SELECTED_PACKAGE_ID, valueWithTokenTtl(SELECTED_PACKAGE_ID)],
  ])("returns deeply frozen %s fields", (_name, source, value) => {
    const shape = selectHumanTransferConfigShape(
      value,
      SELECTED_PACKAGE_ID,
      source,
    );

    expect(Object.isFrozen(shape)).toBe(true);
    expect(Object.isFrozen(shape.fields)).toBe(true);
    expect(() => (shape.fields as string[]).push("forged")).toThrow();
  });
});
