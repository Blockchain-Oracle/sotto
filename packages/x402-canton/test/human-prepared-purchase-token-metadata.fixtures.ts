import type {
  HumanPurchaseLedgerIntent,
  HumanPurchasePrepareRequest,
} from "../src/index.js";

export function humanTransferMetadata(
  request: HumanPurchasePrepareRequest,
): Readonly<Record<string, string>> {
  return request.commands[0].ExerciseCommand.choiceArgument.transfer.meta
    .values;
}

export function humanInnerTransferMetadata(
  intent: HumanPurchaseLedgerIntent,
): Readonly<Record<string, string>> {
  return {
    "splice.lfdecentralizedtrust.org/sender": intent.challenge.payerParty,
    "splice.lfdecentralizedtrust.org/tx-kind": "transfer",
  };
}

export function humanResultMetadata(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): Readonly<Record<string, string>> {
  return {
    ...humanInnerTransferMetadata(intent),
    ...humanTransferMetadata(request),
  };
}
