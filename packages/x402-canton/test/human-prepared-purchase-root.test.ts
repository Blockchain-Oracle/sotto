import type { Exercise } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateHumanPreparedPurchaseRoot } from "../src/human-prepared-purchase-root.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedRootExercise,
  humanPreparedRootInputs,
  preparedRecordField,
} from "./human-prepared-purchase-root.fixtures.js";
import { fixtureScalar } from "./prepared-purchase-value.fixtures.js";

describe("human prepared TransferFactory root", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the exact payer-authorized direct transfer root", async () => {
    const input = await humanPreparedRootInputs();
    expect(() =>
      validateHumanPreparedPurchaseRoot(
        humanPreparedRootExercise(input),
        input.intent,
        input.request,
      ),
    ).not.toThrow();
  });

  it.each([
    ["factory CID", (root: Exercise) => (root.contractId = "00wrong-factory")],
    ["choice", (root: Exercise) => (root.choiceId = "Purchase")],
    ["actor", (root: Exercise) => (root.actingParties = ["agent::1220agent"])],
    ["consuming flag", (root: Exercise) => (root.consuming = true)],
    [
      "purchase metadata",
      (root: Exercise) => {
        const transfer = preparedRecordField(root.chosenValue, "transfer");
        const metadata = preparedRecordField(transfer, "meta");
        const values = preparedRecordField(metadata, "values");
        if (values.sum.oneofKind !== "textMap") {
          throw new Error("metadata absent");
        }
        values.sum.textMap.entries[0]!.value = fixtureScalar(
          "text",
          `sha256:${"0".repeat(64)}`,
        );
      },
    ],
  ])("rejects a changed %s", async (_name, mutate) => {
    const input = await humanPreparedRootInputs();
    const root = humanPreparedRootExercise(input);
    mutate(root);
    expect(() =>
      validateHumanPreparedPurchaseRoot(root, input.intent, input.request),
    ).toThrow(/prepared/iu);
  });
});
