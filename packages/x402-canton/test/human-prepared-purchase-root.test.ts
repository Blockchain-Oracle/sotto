import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHumanPurchasePrepareRequest,
  createHumanTransferFactoryObserver,
} from "../src/index.js";
import { validateHumanPreparedPurchaseRoot } from "../src/human-prepared-purchase-root.js";
import { HOLDING_INTERFACE_ID } from "../src/purchase-holding-types.js";
import { TOKEN_METADATA_PACKAGE_ID } from "../src/prepared-purchase-metadata-values.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";
import {
  fixtureContractIds,
  fixtureExtraArgs,
  fixtureIdentifier,
  fixtureMetadata,
  fixtureRecord,
  fixtureScalar,
  fixtureTimestamp,
} from "./prepared-purchase-value.fixtures.js";

type RootInputs = Awaited<ReturnType<typeof rootInputs>>;

function recordField(value: Value | undefined, label: string): Value {
  if (value?.sum.oneofKind !== "record") throw new Error("record is absent");
  const field = value.sum.record.fields.find((entry) => entry.label === label);
  if (field?.value === undefined) throw new Error(`${label} is absent`);
  return field.value;
}

function rootExercise({ intent, request }: RootInputs): Exercise {
  const source = request.commands[0].ExerciseCommand.choiceArgument;
  const interfacePackage = fixtureIdentifier(
    intent.tokenFactory.interfaceId,
  ).packageId;
  const [, moduleName, entityName] =
    intent.tokenFactory.creationTemplateId.split(":");
  return {
    lfVersion: "2.1",
    contractId: intent.tokenFactory.contractId,
    packageName: "splice-amulet",
    templateId: fixtureIdentifier(
      `${intent.packageSelection.packageIds[0]}:${moduleName}:${entityName}`,
    ),
    interfaceId: fixtureIdentifier(intent.tokenFactory.interfaceId),
    signatories: [intent.tokenFactory.expectedAdmin],
    stakeholders: [intent.tokenFactory.expectedAdmin],
    actingParties: [intent.challenge.payerParty],
    choiceId: "TransferFactory_Transfer",
    chosenValue: fixtureRecord(
      `${interfacePackage}:Splice.Api.Token.TransferInstructionV1:TransferFactory_Transfer`,
      [
        ["expectedAdmin", fixtureScalar("party", source.expectedAdmin)],
        [
          "transfer",
          fixtureRecord(
            `${interfacePackage}:Splice.Api.Token.TransferInstructionV1:Transfer`,
            [
              ["sender", fixtureScalar("party", source.transfer.sender)],
              ["receiver", fixtureScalar("party", source.transfer.receiver)],
              ["amount", fixtureScalar("numeric", source.transfer.amount)],
              [
                "instrumentId",
                fixtureRecord(
                  `${fixtureIdentifier(HOLDING_INTERFACE_ID).packageId}:Splice.Api.Token.HoldingV1:InstrumentId`,
                  [
                    [
                      "admin",
                      fixtureScalar(
                        "party",
                        source.transfer.instrumentId.admin,
                      ),
                    ],
                    [
                      "id",
                      fixtureScalar("text", source.transfer.instrumentId.id),
                    ],
                  ],
                ),
              ],
              ["requestedAt", fixtureTimestamp(source.transfer.requestedAt)],
              [
                "executeBefore",
                fixtureTimestamp(source.transfer.executeBefore),
              ],
              [
                "inputHoldingCids",
                fixtureContractIds(source.transfer.inputHoldingCids),
              ],
              ["meta", fixtureMetadata(source.transfer.meta.values)],
            ],
          ),
        ],
        ["extraArgs", fixtureExtraArgs(request as never)],
      ],
    ),
    consuming: false,
    children: ["1"],
    choiceObservers: [],
  };
}

async function rootInputs() {
  const { holdings, intent } = await humanTransferFactoryInputs();
  const registry = await createHumanTransferFactoryObserver(async () =>
    humanTransferFactoryResponseBytes(intent),
  )(intent, holdings);
  const request = buildHumanPurchasePrepareRequest(intent, holdings, registry);
  return { intent, request };
}

describe("human prepared TransferFactory root", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the exact payer-authorized direct transfer root", async () => {
    const input = await rootInputs();
    expect(() =>
      validateHumanPreparedPurchaseRoot(
        rootExercise(input),
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
        const transfer = recordField(root.chosenValue, "transfer");
        const metadata = recordField(transfer, "meta");
        const values = recordField(metadata, "values");
        if (values.sum.oneofKind !== "textMap")
          throw new Error("metadata absent");
        values.sum.textMap.entries[0]!.value = fixtureScalar(
          "text",
          `sha256:${"0".repeat(64)}`,
        );
      },
    ],
  ])("rejects a changed %s", async (_name, mutate) => {
    const input = await rootInputs();
    const root = rootExercise(input);
    mutate(root);
    expect(() =>
      validateHumanPreparedPurchaseRoot(root, input.intent, input.request),
    ).toThrow(/prepared/iu);
  });

  it("uses the exact Token metadata record", () => {
    expect(TOKEN_METADATA_PACKAGE_ID).toMatch(/^[a-f0-9]{64}$/u);
  });
});
