import { describe, expect, it } from "vitest";
import { digestHumanTransferContext } from "../src/human-transfer-context-digest.js";

const values = {
  "external-party-config-state": {
    tag: "AV_ContractId",
    value: "00external-party-config-state",
  },
  "featured-app-right": {
    tag: "AV_ContractId",
    value: "00featured-app-right",
  },
  "splice.example/round": { tag: "AV_ContractId", value: "00round" },
  "transfer-preapproval": {
    tag: "AV_ContractId",
    value: "00transfer-preapproval",
  },
} as const;

describe("human transfer context digest", () => {
  it("pins the complete order-independent semantic vector", () => {
    const reversed = Object.fromEntries(Object.entries(values).reverse());

    expect(digestHumanTransferContext({ values })).toBe(
      "sha256:3dcaef2d24057b5f397ee058cd22da8377a56b836e9e607bb15d88856d90ce38",
    );
    expect(digestHumanTransferContext({ values: reversed })).toBe(
      digestHumanTransferContext({ values }),
    );
  });

  it("changes for every semantic map mutation", () => {
    const baseline = digestHumanTransferContext({ values });
    const changed = {
      ...values,
      "splice.example/round": {
        tag: "AV_ContractId",
        value: "00other-round",
      },
    };
    const { "splice.example/round": _removed, ...removed } = values;
    void _removed;

    expect(digestHumanTransferContext({ values: changed })).not.toBe(baseline);
    expect(digestHumanTransferContext({ values: removed })).not.toBe(baseline);
    expect(
      digestHumanTransferContext({
        values: {
          ...values,
          later: { tag: "AV_ContractId", value: "00later" },
        },
      }),
    ).not.toBe(baseline);
  });

  it.each([
    ["empty map", { values: {} }],
    ["wrong tag", { values: { key: { tag: "AV_Text", value: "value" } } }],
    [
      "dangerous key",
      { values: { constructor: { tag: "AV_ContractId", value: "00cid" } } },
    ],
    ["extra wrapper", { values, later: true }],
  ])("rejects a %s", (_label, candidate) => {
    expect(() => digestHumanTransferContext(candidate)).toThrow(
      /human transfer context/iu,
    );
  });
});
