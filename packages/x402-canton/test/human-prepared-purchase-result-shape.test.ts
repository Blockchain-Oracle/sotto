import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import {
  humanPreparedExercise,
  humanPreparedField,
} from "./human-prepared-purchase-effect-test-support.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  type HumanPreparedPurchaseFixture,
} from "./human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { fixtureScalar } from "./prepared-purchase-value.fixtures.js";

const OUTER_FIELDS = ["result", "meta"];
const COMPACT_FIELDS = [
  "round",
  "summary",
  "createdAmulets",
  "senderChangeAmulet",
];

function fields(value: Value): string[] {
  if (value.sum.oneofKind !== "record") {
    throw new Error("test prepared result is not a record");
  }
  return value.sum.record.fields.map(({ label }) => label);
}

function kinds(value: Value): string[] {
  if (value.sum.oneofKind !== "record") {
    throw new Error("test prepared result is not a record");
  }
  return value.sum.record.fields.map(
    ({ value: field }) => field?.sum.oneofKind ?? "absent",
  );
}

function resultValues(prepared: HumanPreparedPurchaseFixture) {
  const outer = humanPreparedExercise(prepared, "1").exerciseResult;
  if (outer === undefined) throw new Error("test outer result is absent");
  return { outer, transfer: humanPreparedField(outer, "result") };
}

describe("human prepared SendV2 result normalization", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the exact non-verbose compact result observed on Five North", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const { outer, transfer } = resultValues(prepared);
      expect(fields(outer)).toEqual(OUTER_FIELDS);
      expect(kinds(outer)).toEqual(["record", "record"]);
      expect(fields(transfer)).toEqual(COMPACT_FIELDS);
      expect(kinds(transfer)).toEqual(["record", "record", "list", "optional"]);
    });

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).not.toThrow();
  });

  it("rejects an explicit trailing inner Optional None", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const { transfer } = resultValues(prepared);
      expect(fields(transfer)).toEqual(COMPACT_FIELDS);
      if (transfer.sum.oneofKind !== "record") {
        throw new Error("test transfer result is not a record");
      }
      transfer.sum.record.fields.push({
        label: "meta",
        value: { sum: { oneofKind: "optional", optional: {} } },
      });
      expect(fields(transfer)).toEqual([...COMPACT_FIELDS, "meta"]);
    });

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow("prepared human transfer result effect fields do not match");
  });

  it("keeps the outer result purchase commitment authoritative", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const metadata = humanPreparedField(resultValues(prepared).outer, "meta");
      const values = humanPreparedField(metadata, "values");
      if (values.sum.oneofKind !== "textMap") {
        throw new Error("test outer result metadata map is absent");
      }
      const entry = values.sum.textMap.entries.find(
        ({ key }) => key === "sotto-x402/v1/purchase-commitment",
      );
      if (entry === undefined) {
        throw new Error("test outer purchase commitment is absent");
      }
      entry.value = fixtureScalar("text", `sha256:${"f".repeat(64)}`);
    });

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(
      "prepared human TransferPreapproval result metadata effect does not match",
    );
  });
});
