import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { preparedMetadataMatches } from "./prepared-purchase-metadata-match.js";

function requireMetadata(
  value: Value | undefined,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  if (!preparedMetadataMatches(value, expected, label)) {
    throw new Error(`prepared ${label} effect does not match`);
  }
}

export function validateHumanTransferMetadata(
  value: Value | undefined,
  request: HumanPurchasePrepareRequest,
  label: string,
): void {
  requireMetadata(
    value,
    request.commands[0].ExerciseCommand.choiceArgument.transfer.meta.values,
    label,
  );
}

export function validateHumanResultMetadata(
  value: Value | undefined,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  label: string,
): void {
  requireMetadata(
    value,
    {
      "splice.lfdecentralizedtrust.org/sender": intent.challenge.payerParty,
      "splice.lfdecentralizedtrust.org/tx-kind": "transfer",
      ...request.commands[0].ExerciseCommand.choiceArgument.transfer.meta
        .values,
    },
    label,
  );
}
