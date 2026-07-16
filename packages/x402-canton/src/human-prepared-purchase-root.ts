import type { Exercise } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedContractIds,
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import {
  preparedExtraArgs,
  preparedMetadata,
} from "./prepared-purchase-metadata-values.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";

function micros(value: string): string {
  return (BigInt(Date.parse(value)) * 1_000n).toString();
}

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function validateIdentity(
  exercise: Exercise,
  intent: HumanPurchaseLedgerIntent,
): void {
  const [, moduleName, entityName] =
    intent.tokenFactory.creationTemplateId.split(":");
  const packageId = intent.packageSelection.packageIds[0];
  if (!moduleName || !entityName) {
    throw new Error("prepared human factory authority is invalid");
  }
  preparedIdentifier(
    exercise.templateId,
    `${packageId}:${moduleName}:${entityName}`,
    "human TransferFactory template",
  );
  preparedIdentifier(
    exercise.interfaceId,
    intent.tokenFactory.interfaceId,
    "human TransferFactory interface",
  );
  if (
    exercise.contractId !== intent.tokenFactory.contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "TransferFactory_Transfer" ||
    exercise.consuming ||
    exercise.choiceObservers.length !== 0
  ) {
    throw new Error("prepared human TransferFactory identity does not match");
  }
  preparedParties(
    exercise.actingParties,
    intent.actAs,
    "human TransferFactory acting",
  );
  preparedParties(
    exercise.signatories,
    [intent.tokenFactory.expectedAdmin],
    "human TransferFactory signatory",
  );
  preparedParties(
    exercise.stakeholders,
    [intent.tokenFactory.expectedAdmin],
    "human TransferFactory stakeholder",
  );
}

function validateTransfer(
  exercise: Exercise,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): void {
  const expected = request.commands[0].ExerciseCommand.choiceArgument;
  const packageId = intent.tokenFactory.interfaceId.split(":")[0]!;
  const choice = preparedRecord(
    exercise.chosenValue,
    ["expectedAdmin", "transfer", "extraArgs"],
    "human TransferFactory choice",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferFactory_Transfer`,
  );
  preparedScalar(
    choice.get("expectedAdmin"),
    "party",
    expected.expectedAdmin,
    "human TransferFactory expected admin",
  );
  const transfer = preparedRecord(
    choice.get("transfer"),
    [
      "sender",
      "receiver",
      "amount",
      "instrumentId",
      "requestedAt",
      "executeBefore",
      "inputHoldingCids",
      "meta",
    ],
    "human TransferFactory transfer",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:Transfer`,
  );
  const scalarFields = [
    ["sender", "party", expected.transfer.sender],
    ["receiver", "party", expected.transfer.receiver],
    ["amount", "numeric", expected.transfer.amount],
    ["requestedAt", "timestamp", micros(expected.transfer.requestedAt)],
    ["executeBefore", "timestamp", micros(expected.transfer.executeBefore)],
  ] as const;
  for (const [field, kind, value] of scalarFields) {
    preparedScalar(
      transfer.get(field),
      kind,
      value,
      `human TransferFactory ${field}`,
    );
  }
  const instrument = preparedRecord(
    transfer.get("instrumentId"),
    ["admin", "id"],
    "human TransferFactory instrument",
    `${HOLDING_INTERFACE_ID.split(":")[0]}:Splice.Api.Token.HoldingV1:InstrumentId`,
  );
  preparedScalar(
    instrument.get("admin"),
    "party",
    expected.transfer.instrumentId.admin,
    "human TransferFactory instrument admin",
  );
  preparedScalar(
    instrument.get("id"),
    "text",
    expected.transfer.instrumentId.id,
    "human TransferFactory instrument ID",
  );
  if (
    JSON.stringify(
      preparedContractIds(
        transfer.get("inputHoldingCids"),
        "human TransferFactory inputs",
      ),
    ) !== JSON.stringify(expected.transfer.inputHoldingCids)
  ) {
    throw new Error("prepared human TransferFactory inputs do not match");
  }
  const actualMetadata = preparedMetadata(
    transfer.get("meta"),
    "human TransferFactory metadata",
  );
  const expectedMetadata = Object.entries(expected.transfer.meta.values).sort(
    ([left], [right]) => utf8Compare(left, right),
  );
  if (JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error("prepared human TransferFactory metadata does not match");
  }
  preparedExtraArgs(
    choice.get("extraArgs"),
    expected.extraArgs.context,
    "human TransferFactory extraArgs",
  );
}

export function validateHumanPreparedPurchaseRoot(
  exercise: Exercise,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): void {
  validateIdentity(exercise, intent);
  validateTransfer(exercise, intent, request);
}
