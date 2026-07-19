import { describe, expect, it } from "vitest";
import { assertStrictJson } from "../src/strict-json.js";

describe("strict JSON structural bounds", () => {
  it("accepts exactly 1024 nodes and rejects node 1025", () => {
    const exact = JSON.stringify(Array.from({ length: 1_023 }, () => null));
    const oversized = JSON.stringify(Array.from({ length: 1_024 }, () => null));

    expect(() => assertStrictJson(exact)).not.toThrow();
    expect(() => assertStrictJson(oversized)).toThrow("structural limits");
  });
});
