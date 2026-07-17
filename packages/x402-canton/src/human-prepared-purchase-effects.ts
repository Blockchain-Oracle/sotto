import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanPreparedPurchaseAccounting } from "./human-prepared-purchase-accounting.js";
import { validateHumanPreparedChildOrder } from "./human-prepared-purchase-child-order.js";
import { validateHumanPreparedEventLogs } from "./human-prepared-purchase-event-logs.js";
import { validateHumanPreparedHoldingEffects } from "./human-prepared-purchase-holding-effects.js";
import { validateHumanPreparedPurchaseInputEffects } from "./human-prepared-purchase-input-effects.js";
import { validateHumanPreparedTransferEffects } from "./human-prepared-purchase-transfer-effects.js";
import type { PreparedPurchaseGraph } from "./prepared-purchase-graph-types.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";

export function validateHumanPreparedPurchaseEffects(
  graph: PreparedPurchaseGraph,
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): void {
  const inputs = validateHumanPreparedPurchaseInputEffects(
    metadata,
    intent,
    request,
  );
  const transfer = validateHumanPreparedTransferEffects(
    graph,
    metadata,
    intent,
    request,
    inputs.preapprovalProvider,
  );
  const eventIds = validateHumanPreparedEventLogs(
    graph,
    transfer,
    intent,
    request,
  );
  const holdings = validateHumanPreparedHoldingEffects(
    graph,
    inputs.holdings,
    transfer,
    intent,
  );
  const expectedChildren =
    inputs.holdings.size +
    transfer.receiverHoldingCids.length +
    transfer.senderChangeCids.length +
    transfer.innerFetchIds.size +
    eventIds.length;
  if (
    transfer.preapproval.children.length !== expectedChildren ||
    graph.nodes.size !== expectedChildren + 2 + transfer.rootFetchIds.size
  ) {
    throw new Error("prepared human transfer contains an unknown effect");
  }
  validateHumanPreparedChildOrder(
    graph,
    transfer,
    request.commands[0].ExerciseCommand.choiceArgument.transfer
      .inputHoldingCids,
    eventIds,
  );
  validateHumanPreparedPurchaseAccounting(
    holdings,
    transfer,
    intent,
    inputs.configuration,
  );
}
