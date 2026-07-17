import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import type { ReferenceHumanWalletGraph } from "./reference-human-wallet-graph.js";
import { readReferenceHumanWalletTransferChoice } from "./reference-human-wallet-transfer-choice.js";
import { readReferenceHumanWalletTransferResults } from "./reference-human-wallet-transfer-result.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export type ReferenceHumanWalletTransfer = Readonly<{
  changeAmount: string;
  changeIds: readonly string[];
  configContractId: string;
  contractId: string;
  featuredContractId: string;
  inputHoldingIds: readonly string[];
  nodeId: string;
  preapprovalParties: readonly string[];
  receiverIds: readonly string[];
}>;

export function validateReferenceHumanWalletTransfer(
  graph: ReferenceHumanWalletGraph,
  request: HumanWalletApprovalRequest,
  rootInputHoldingIds: readonly string[],
): ReferenceHumanWalletTransfer {
  const matches = [...graph.nodes.values()].flatMap(
    ({ nodeId, versionedNode }) =>
      versionedNode.oneofKind === "v1" &&
      versionedNode.v1.nodeType.oneofKind === "exercise" &&
      versionedNode.v1.nodeType.exercise.choiceId ===
        "TransferPreapproval_SendV2"
        ? [
            Object.freeze({
              nodeId,
              exercise: versionedNode.v1.nodeType.exercise,
            }),
          ]
        : [],
  );
  if (matches.length !== 1) fail("preapproval effect");
  const { exercise, nodeId } = matches[0]!;
  const approval = request.approval;
  referenceHumanIdentifier(
    exercise.templateId,
    `${approval.selectedPackage.packageId}:Splice.AmuletRules:TransferPreapproval`,
    "preapproval template",
  );
  if (
    exercise.lfVersion !== "2.1" ||
    exercise.interfaceId !== undefined ||
    exercise.contractId === "" ||
    exercise.packageName !== "splice-amulet" ||
    exercise.consuming ||
    exercise.choiceObservers.length !== 0
  ) {
    fail("preapproval identity");
  }
  referenceHumanParties(
    exercise.actingParties,
    [approval.payerParty],
    "preapproval acting",
  );
  if (
    exercise.signatories.length !== 3 ||
    !exercise.signatories.includes(approval.tokenFactory.expectedAdmin) ||
    !exercise.signatories.includes(approval.providerParty)
  ) {
    fail("preapproval signatory");
  }
  referenceHumanParties(
    exercise.stakeholders,
    exercise.signatories,
    "preapproval stakeholder",
  );
  const choice = referenceHumanRecord(
    exercise.chosenValue,
    ["context", "inputs", "amount", "sender", "description", "meta"],
    "preapproval choice",
    `${approval.selectedPackage.packageId}:Splice.AmuletRules:TransferPreapproval_SendV2`,
  );
  referenceHumanScalar(
    choice.get("amount"),
    "numeric",
    `${BigInt(approval.amountAtomic) / 10_000_000_000n}.${(BigInt(approval.amountAtomic) % 10_000_000_000n).toString().padStart(10, "0")}`,
    "preapproval amount",
  );
  referenceHumanScalar(
    choice.get("sender"),
    "party",
    approval.payerParty,
    "preapproval sender",
  );
  const selected = readReferenceHumanWalletTransferChoice(choice, request);
  if (
    JSON.stringify(selected.inputHoldingIds) !==
    JSON.stringify(rootInputHoldingIds)
  ) {
    fail("preapproval inputs");
  }
  const result = readReferenceHumanWalletTransferResults(
    graph.root,
    exercise,
    request,
  );
  return Object.freeze({
    ...result,
    ...selected,
    contractId: exercise.contractId,
    nodeId,
    preapprovalParties: Object.freeze([...exercise.signatories]),
  });
}
