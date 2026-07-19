import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { preparedTransferContextIds } from "./prepared-transfer-context-ids.js";

export function preparedPurchaseContextIds(
  request: BoundedPurchasePrepareRequest,
): ReadonlyMap<string, string> {
  return preparedTransferContextIds(
    request.commands[0]!.ExerciseCommand.choiceArgument.extraArgs.context,
  );
}
