import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanPreparedFetchEffects } from "./human-prepared-purchase-fetch-effects.js";
import { validateHumanPreparedRootFetchEffects } from "./human-prepared-purchase-root-fetch-effects.js";
import { validateHumanTransferMetadata } from "./human-prepared-purchase-metadata-effects.js";
import {
  validateHumanFactoryResultMetadata,
  validateHumanPreapprovalResult,
  type HumanPreparedTransferResult,
} from "./human-prepared-purchase-transfer-result.js";
import {
  preparedIdentifier,
  preparedParties,
  preparedRecord,
} from "./prepared-purchase-effect-values.js";
import { validatePreparedFactoryResult } from "./prepared-purchase-factory-result.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import { validateTransferPreapprovalChoice } from "./prepared-purchase-transfer-preapproval-values.js";
import { preparedTransferContextIds } from "./prepared-transfer-context-ids.js";

type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

export type HumanPreparedTransferEffects = Readonly<{
  preapproval: ExerciseNode;
  innerFetchIds: ReadonlySet<string>;
  rootFetchIds: ReadonlySet<string>;
  receiverHoldingCids: readonly string[];
  senderChangeCids: readonly string[];
  transfer: HumanPreparedTransferResult;
}>;

function validatePreapprovalIdentity(
  node: ExerciseNode,
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  contractId: string,
  provider: string,
): void {
  const exercise = node.exercise;
  const source = metadata.inputContracts.get(contractId);
  preparedIdentifier(
    exercise.templateId,
    `${intent.packageSelection.packageIds[0]}:Splice.AmuletRules:TransferPreapproval`,
    "human TransferPreapproval template",
  );
  if (
    source === undefined ||
    exercise.interfaceId !== undefined ||
    exercise.contractId !== contractId ||
    exercise.packageName !== "splice-amulet" ||
    exercise.choiceId !== "TransferPreapproval_SendV2" ||
    exercise.consuming ||
    exercise.choiceObservers.length !== 0
  ) {
    throw new Error(
      "prepared human TransferPreapproval identity does not match",
    );
  }
  preparedParties(
    exercise.actingParties,
    intent.actAs,
    "human TransferPreapproval acting",
  );
  preparedParties(
    exercise.signatories,
    source.signatories,
    "human TransferPreapproval signatory",
  );
  preparedParties(
    exercise.stakeholders,
    source.stakeholders,
    "human TransferPreapproval stakeholder",
  );
  preparedParties(
    exercise.signatories,
    [
      ...new Set([
        intent.tokenFactory.expectedAdmin,
        intent.challenge.recipientParty,
        provider,
      ]),
    ],
    "human TransferPreapproval authority",
  );
}

export function validateHumanPreparedTransferEffects(
  graph: PreparedPurchaseGraph,
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  preapprovalProvider: string,
): HumanPreparedTransferEffects {
  const root = graph.nodes.get(graph.rootId);
  if (root?.kind !== "exercise") {
    throw new Error("prepared human TransferFactory effect root is absent");
  }
  const factory = validatePreparedFactoryResult(root.exercise, intent);
  validateHumanFactoryResultMetadata(root.exercise, intent, request);
  const preapprovals = root.children
    .map((nodeId) => graph.nodes.get(nodeId))
    .filter(
      (node): node is ExerciseNode =>
        node?.kind === "exercise" &&
        node.exercise.choiceId === "TransferPreapproval_SendV2",
    );
  if (preapprovals.length !== 1) {
    throw new Error(
      "prepared human direct transfer effect is absent or additional",
    );
  }
  const preapproval = preapprovals[0]!;
  const command = request.commands[0].ExerciseCommand.choiceArgument;
  const contextIds = preparedTransferContextIds(command.extraArgs.context);
  const rootFetchIds = validateHumanPreparedRootFetchEffects(
    graph,
    root.children,
    metadata,
    intent,
    contextIds,
    command.transfer.inputHoldingCids,
  );
  if (root.children.length !== rootFetchIds.size + 1) {
    throw new Error("prepared human factory contains an unknown root effect");
  }
  if (root.children.at(-1) !== preapproval.nodeId) {
    throw new Error("prepared human TransferPreapproval order does not match");
  }
  validatePreapprovalIdentity(
    preapproval,
    metadata,
    intent,
    contextIds.get("transfer-preapproval") ?? "",
    preapprovalProvider,
  );
  validateTransferPreapprovalChoice(
    preapproval,
    intent,
    {
      amount: command.transfer.amount,
      inputHoldingCids: command.transfer.inputHoldingCids,
    },
    intent.packageSelection.packageIds[0],
    contextIds,
  );
  const choice = preparedRecord(
    preapproval.exercise.chosenValue,
    ["context", "inputs", "amount", "sender", "description", "meta"],
    "human TransferPreapproval choice",
  );
  const choiceMeta = choice.get("meta");
  if (
    choiceMeta?.sum.oneofKind !== "optional" ||
    choiceMeta.sum.optional.value === undefined
  ) {
    throw new Error("prepared human TransferPreapproval metadata is absent");
  }
  validateHumanTransferMetadata(
    choiceMeta.sum.optional.value,
    request,
    "human TransferPreapproval metadata",
  );
  const innerFetchIds = validateHumanPreparedFetchEffects(
    graph,
    preapproval,
    metadata,
    intent,
    contextIds,
    command.transfer.inputHoldingCids,
    preapprovalProvider,
  );
  return Object.freeze({
    preapproval,
    innerFetchIds,
    rootFetchIds,
    receiverHoldingCids: factory.receiverHoldingCids,
    senderChangeCids: factory.senderChangeCids,
    transfer: validateHumanPreapprovalResult(
      preapproval.exercise,
      intent,
      request,
      factory,
    ),
  });
}
