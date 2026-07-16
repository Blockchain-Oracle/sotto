import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import {
  buildHumanPurchasePrepareRequest,
  createHumanTransferFactoryObserver,
} from "../src/index.js";
import { HOLDING_INTERFACE_ID } from "../src/purchase-holding-types.js";
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

export type HumanPreparedRootInputs = Awaited<
  ReturnType<typeof humanPreparedRootInputs>
>;

export function preparedRecordField(
  value: Value | undefined,
  label: string,
): Value {
  if (value?.sum.oneofKind !== "record") throw new Error("record is absent");
  const field = value.sum.record.fields.find((entry) => entry.label === label);
  if (field?.value === undefined) throw new Error(`${label} is absent`);
  return field.value;
}

export function humanPreparedRootExercise({
  intent,
  request,
}: HumanPreparedRootInputs): Exercise {
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

export async function humanPreparedRootInputs() {
  const { holdings, intent } = await humanTransferFactoryInputs();
  const registry = await createHumanTransferFactoryObserver(async () =>
    humanTransferFactoryResponseBytes(intent),
  )(intent, holdings);
  const request = buildHumanPurchasePrepareRequest(intent, holdings, registry);
  return { intent, request };
}
