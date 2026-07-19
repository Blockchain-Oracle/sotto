import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  validHumanPreparedPurchase,
  type HumanPreparedPurchaseFixture,
} from "./human-prepared-purchase.fixtures.js";
import {
  HISTORICAL_HOLDING_TEMPLATE_ID,
  HOLDING_INTERFACE_ID,
} from "./prepared-purchase-effect-values.fixtures.js";
import { fixtureIdentifier } from "./prepared-purchase-value.fixtures.js";

function holdingId(
  request: Awaited<
    ReturnType<typeof humanPreparedPurchaseCommandInputs>
  >["request"],
): string {
  return request.commands[0].ExerciseCommand.choiceArgument.transfer
    .inputHoldingCids[0]!;
}
function holdingInput(
  prepared: HumanPreparedPurchaseFixture,
  contractId: string,
) {
  const input = prepared.metadata?.inputContracts.find(
    ({ contract }) =>
      contract.oneofKind === "v1" && contract.v1.contractId === contractId,
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error("test Holding input is absent");
  }
  return input.contract.v1;
}
function holdingEffects(
  prepared: HumanPreparedPurchaseFixture,
  contractId: string,
) {
  return (prepared.transaction?.nodes ?? [])
    .map(({ versionedNode }) =>
      versionedNode.oneofKind === "v1" ? versionedNode.v1.nodeType : undefined,
    )
    .filter(
      (node) =>
        (node?.oneofKind === "fetch" && node.fetch.contractId === contractId) ||
        (node?.oneofKind === "exercise" &&
          node.exercise.contractId === contractId),
    );
}
function recordField(value: Value | undefined, label: string): Value {
  if (value?.sum.oneofKind !== "record") {
    throw new Error("test Holding record is absent");
  }
  const field = value.sum.record.fields.find(
    (candidate) => candidate.label === label,
  );
  if (field?.value === undefined) {
    throw new Error(`test Holding ${label} field is absent`);
  }
  return field.value;
}
describe("human prepared Holding package upgrades", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts historical metadata enriched and exercised as the selected package", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const prepared = validHumanPreparedPurchase(intent, request);
    const contractId = holdingId(request);
    const input = holdingInput(prepared, contractId);
    const selected = intent.packageSelection.packageIds[0];
    const argumentId =
      input.argument?.sum.oneofKind === "record"
        ? input.argument.sum.record.recordId
        : undefined;
    expect(input.templateId?.packageId).not.toBe(selected);
    expect(argumentId?.packageId).toBe(selected);
    const effects = holdingEffects(prepared, contractId);
    expect(effects).toHaveLength(3);
    expect(
      effects.every((node) =>
        node?.oneofKind === "fetch"
          ? node.fetch.templateId?.packageId === selected
          : node?.oneofKind === "exercise" &&
            node.exercise.templateId?.packageId === selected &&
            node.exercise.interfaceId === undefined,
      ),
    ).toBe(true);

    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        humanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).not.toThrow();
  });
  it.each([
    ["argument", (argument: Value | undefined) => argument],
    [
      "amount",
      (argument: Value | undefined) => recordField(argument, "amount"),
    ],
    [
      "round",
      (argument: Value | undefined) =>
        recordField(recordField(argument, "amount"), "createdAt"),
    ],
    [
      "rate",
      (argument: Value | undefined) =>
        recordField(recordField(argument, "amount"), "ratePerRound"),
    ],
  ])("rejects a historical enriched Holding %s ID", async (_name, value) => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const input = holdingInput(prepared, holdingId(request));
      const target = value(input.argument);
      const record =
        target?.sum.oneofKind === "record" ? target.sum.record : undefined;
      if (record?.recordId === undefined) {
        throw new Error("test Holding argument is absent");
      }
      record.recordId.packageId = HISTORICAL_HOLDING_TEMPLATE_ID.split(":")[0]!;
    });
    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(/Holding.*identifier/u);
  });
  it.each([
    ["root", 0, /prepared human root fetch identity/u],
    ["inner", 1, /prepared human authenticated fetch identity/u],
  ])("rejects a historical %s Holding fetch", async (_name, index, error) => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const fetches = holdingEffects(prepared, holdingId(request)).filter(
        (node) => node?.oneofKind === "fetch",
      );
      const node = fetches[index];
      if (node?.oneofKind !== "fetch") {
        throw new Error("test Holding fetch is absent");
      }
      node.fetch.templateId = fixtureIdentifier(HISTORICAL_HOLDING_TEMPLATE_ID);
    });
    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(error);
  });
  it.each(["template", "interface"])(
    "rejects a historical Holding Archive %s",
    async (mutation) => {
      const { intent, request } = await humanPreparedPurchaseCommandInputs();
      const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
        const archive = holdingEffects(prepared, holdingId(request)).find(
          (node) => node?.oneofKind === "exercise",
        );
        if (archive?.oneofKind !== "exercise") {
          throw new Error("test Holding Archive is absent");
        }
        if (mutation === "interface") {
          archive.exercise.interfaceId =
            fixtureIdentifier(HOLDING_INTERFACE_ID);
        } else {
          archive.exercise.templateId = fixtureIdentifier(
            HISTORICAL_HOLDING_TEMPLATE_ID,
          );
        }
      });
      expect(() =>
        inspectHumanPreparedPurchaseStructure(bytes, intent, request),
      ).toThrow(/prepared human Holding archive identity/u);
    },
  );
  it("rejects a wrong Holding Archive argument identifier", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const archive = holdingEffects(prepared, holdingId(request)).find(
        (node) => node?.oneofKind === "exercise",
      );
      if (
        archive?.oneofKind !== "exercise" ||
        archive.exercise.chosenValue?.sum.oneofKind !== "record" ||
        archive.exercise.chosenValue.sum.record.recordId === undefined
      ) {
        throw new Error("test Holding Archive argument is absent");
      }
      archive.exercise.chosenValue.sum.record.recordId.packageId = "f".repeat(
        64,
      );
    });
    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(/Holding archive choice.*identifier/iu);
  });
});
