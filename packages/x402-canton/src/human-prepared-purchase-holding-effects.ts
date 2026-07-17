import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanPreparedHoldingArchive } from "./human-prepared-purchase-archive-effect.js";
import {
  readHumanPreparedHoldingValue,
  type HumanPreparedHoldingValue,
} from "./human-prepared-purchase-holding-value.js";
import type { HumanPreparedTransferEffects } from "./human-prepared-purchase-transfer-effects.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import { FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID } from "./purchase-holding-types.js";

type CreateNode = Extract<PreparedPurchaseGraphNode, { kind: "create" }>;
type ExerciseNode = Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>;

export type HumanPreparedHoldingEffects = Readonly<{
  change: readonly HumanPreparedHoldingValue[];
  input: readonly HumanPreparedHoldingValue[];
  receiver: readonly HumanPreparedHoldingValue[];
}>;

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function exactIds(
  actual: readonly string[],
  expected: readonly string[],
): void {
  const canonical = (values: readonly string[]) =>
    [...values].sort(utf8Compare);
  if (
    new Set(actual).size !== actual.length ||
    new Set(expected).size !== expected.length ||
    JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))
  ) {
    throw new Error("prepared human Holding effect linkage does not match");
  }
}

function templateId(
  create: Create,
  allowedPackages: readonly string[],
  label: string,
): string {
  const template = create.templateId;
  if (
    template === undefined ||
    !allowedPackages.includes(template.packageId) ||
    template.moduleName !== "Splice.Amulet" ||
    template.entityName !== "Amulet"
  ) {
    throw new Error(`prepared ${label} template does not match`);
  }
  return `${template.packageId}:${template.moduleName}:${template.entityName}`;
}

function exactCreate(
  nodes: readonly CreateNode[],
  contractId: string,
): CreateNode {
  const matches = nodes.filter(
    ({ create }) => create.contractId === contractId,
  );
  if (matches.length !== 1) {
    throw new Error("prepared human Holding create is absent or duplicated");
  }
  return matches[0]!;
}

export function validateHumanPreparedHoldingEffects(
  graph: PreparedPurchaseGraph,
  inputs: ReadonlyMap<string, Create>,
  transfer: HumanPreparedTransferEffects,
  intent: HumanPurchaseLedgerIntent,
): HumanPreparedHoldingEffects {
  const selectedPackage = intent.packageSelection.packageIds[0];
  const inputPackages = [
    FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
    selectedPackage,
  ];
  const children = transfer.preapproval.children.map((id) =>
    graph.nodes.get(id),
  );
  const archives = children.filter(
    (node): node is ExerciseNode =>
      node?.kind === "exercise" && node.exercise.choiceId === "Archive",
  );
  exactIds(
    archives.map(({ exercise }) => exercise.contractId),
    [...inputs.keys()],
  );
  for (const { exercise } of archives) {
    const input = inputs.get(exercise.contractId);
    if (input === undefined) {
      throw new Error("prepared human Holding archive input is absent");
    }
    validateHumanPreparedHoldingArchive(exercise, input, intent);
  }
  const creates = children.filter(
    (node): node is CreateNode => node?.kind === "create",
  );
  const outputIds = [
    ...transfer.receiverHoldingCids,
    ...transfer.senderChangeCids,
  ];
  exactIds(
    creates.map(({ create }) => create.contractId),
    outputIds,
  );
  const allIds = [...inputs.keys(), ...outputIds];
  if (new Set(allIds).size !== allIds.length) {
    throw new Error("prepared human Holding input and output IDs overlap");
  }
  const input = [...inputs.values()].map((create) =>
    readHumanPreparedHoldingValue(
      create,
      templateId(create, inputPackages, "human input Holding"),
      intent.challenge.payerParty,
      intent,
      "human input Holding",
    ),
  );
  const readOutputs = (
    contractIds: readonly string[],
    owner: string,
    label: string,
  ) =>
    contractIds.map((contractId) => {
      const create = exactCreate(creates, contractId).create;
      return readHumanPreparedHoldingValue(
        create,
        templateId(create, [selectedPackage], label),
        owner,
        intent,
        label,
      );
    });
  return Object.freeze({
    input: Object.freeze(input),
    receiver: Object.freeze(
      readOutputs(
        transfer.receiverHoldingCids,
        intent.challenge.recipientParty,
        "human receiver Holding",
      ),
    ),
    change: Object.freeze(
      readOutputs(
        transfer.senderChangeCids,
        intent.challenge.payerParty,
        "human change Holding",
      ),
    ),
  });
}
