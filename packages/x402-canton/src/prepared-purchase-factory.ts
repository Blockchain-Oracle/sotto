import type { Exercise } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedContractIds,
  preparedIdentifier,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import {
  preparedEmptyMetadata,
  preparedExtraArgs,
} from "./prepared-purchase-metadata-values.js";
import {
  type PreparedFactoryResult,
  validatePreparedFactoryResult,
} from "./prepared-purchase-factory-result.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

function micros(value: string): string {
  return (BigInt(Date.parse(value)) * 1_000n).toString();
}

function validateFactoryIdentity(
  exercise: Exercise,
  intent: BoundedPurchaseLedgerIntent,
): void {
  preparedIdentifier(
    exercise.templateId,
    intent.tokenFactory.creationTemplateId,
    "TransferFactory creation template",
  );
  preparedIdentifier(
    exercise.interfaceId,
    intent.tokenFactory.interfaceId,
    "TransferFactory V1 interface",
  );
  if (
    exercise.contractId !== intent.tokenFactory.contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "TransferFactory_Transfer" ||
    exercise.consuming
  ) {
    throw new Error("prepared TransferFactory effect identity does not match");
  }
  preparedParties(
    exercise.actingParties,
    [intent.challenge.payerParty],
    "TransferFactory acting",
  );
  preparedParties(
    exercise.signatories,
    [intent.tokenFactory.expectedAdmin],
    "TransferFactory signatory",
  );
  preparedParties(
    exercise.stakeholders,
    [intent.tokenFactory.expectedAdmin],
    "TransferFactory stakeholder",
  );
  if (exercise.choiceObservers.length !== 0) {
    throw new Error("prepared TransferFactory effect has choice observers");
  }
}

function validateFactoryChoice(
  exercise: Exercise,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const packageId = intent.tokenFactory.interfaceId.split(":")[0]!;
  const choice = preparedRecord(
    exercise.chosenValue,
    ["expectedAdmin", "transfer", "extraArgs"],
    "TransferFactory choice",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferFactory_Transfer`,
  );
  preparedScalar(
    choice.get("expectedAdmin"),
    "party",
    intent.tokenFactory.expectedAdmin,
    "TransferFactory expected admin",
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
    "TransferFactory transfer",
    `${packageId}:Splice.Api.Token.TransferInstructionV1:Transfer`,
  );
  preparedScalar(
    transfer.get("sender"),
    "party",
    intent.challenge.payerParty,
    "TransferFactory sender",
  );
  preparedScalar(
    transfer.get("receiver"),
    "party",
    intent.challenge.recipientParty,
    "TransferFactory receiver",
  );
  preparedScalar(
    transfer.get("amount"),
    "numeric",
    request.commands[0]!.ExerciseCommand.choiceArgument.amount,
    "TransferFactory amount",
  );
  const instrument = preparedRecord(
    transfer.get("instrumentId"),
    ["admin", "id"],
    "TransferFactory instrument",
    `${HOLDING_INTERFACE_ID.split(":")[0]}:Splice.Api.Token.HoldingV1:InstrumentId`,
  );
  preparedScalar(
    instrument.get("admin"),
    "party",
    intent.challenge.instrument.admin,
    "TransferFactory instrument admin",
  );
  preparedScalar(
    instrument.get("id"),
    "text",
    intent.challenge.instrument.id,
    "TransferFactory instrument ID",
  );
  preparedScalar(
    transfer.get("requestedAt"),
    "timestamp",
    micros(intent.challenge.requestedAt),
    "TransferFactory requestedAt",
  );
  preparedScalar(
    transfer.get("executeBefore"),
    "timestamp",
    micros(intent.challenge.executeBefore),
    "TransferFactory executeBefore",
  );
  if (
    JSON.stringify(
      preparedContractIds(
        transfer.get("inputHoldingCids"),
        "TransferFactory inputs",
      ),
    ) !==
    JSON.stringify(
      request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids,
    )
  ) {
    throw new Error("prepared TransferFactory effect inputs do not match");
  }
  preparedEmptyMetadata(
    transfer.get("meta"),
    "TransferFactory transfer metadata",
  );
  preparedExtraArgs(
    choice.get("extraArgs"),
    request.commands[0]!.ExerciseCommand.choiceArgument.extraArgs.context,
    "TransferFactory extraArgs",
  );
}

export function validatePreparedPurchaseFactory(
  exercise: Exercise,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): PreparedFactoryResult {
  validateFactoryIdentity(exercise, intent);
  validateFactoryChoice(exercise, intent, request);
  return validatePreparedFactoryResult(exercise, intent);
}
