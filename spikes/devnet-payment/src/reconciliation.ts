import type { SettlementProof } from "./provider.js";
import { settlementCommandId } from "./settlement.js";

export type ReconciliationExpectation = Readonly<{
  amuletRulesContractId: string;
  amuletRulesTemplateId: string;
  amount: string;
  commandId?: string;
  dsoParty: string;
  payerParty: string;
  providerParty: string;
  synchronizerId: string;
}>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function reconcileSettlementTransaction(
  response: unknown,
  proof: SettlementProof,
  expected: ReconciliationExpectation,
): boolean {
  const transaction = record(record(response)?.transaction);
  if (
    transaction?.updateId !== proof.updateId ||
    transaction.synchronizerId !== expected.synchronizerId ||
    transaction.commandId !==
      (expected.commandId ?? settlementCommandId(proof)) ||
    !Array.isArray(transaction.events)
  ) {
    return false;
  }

  const transfers = transaction.events
    .map((entry) => record(record(entry)?.ExercisedEvent))
    .filter(
      (event) =>
        event?.choice === "AmuletRules_Transfer" &&
        event.contractId === expected.amuletRulesContractId &&
        event.templateId === expected.amuletRulesTemplateId,
    );
  if (transfers.length !== 1) {
    return false;
  }
  const event = transfers[0];
  const choiceArgument = record(event?.choiceArgument);
  const transfer = record(choiceArgument?.transfer);
  const outputs = transfer?.outputs;
  const inputs = transfer?.inputs;
  if (
    choiceArgument?.expectedDso !== expected.dsoParty ||
    transfer?.sender !== expected.payerParty ||
    transfer.provider !== expected.providerParty ||
    !Array.isArray(outputs) ||
    outputs.length !== 1 ||
    !Array.isArray(inputs) ||
    inputs.length < 1
  ) {
    return false;
  }
  const output = record(outputs[0]);
  if (
    output?.receiver !== expected.providerParty ||
    output.amount !== expected.amount
  ) {
    return false;
  }
  const createdAmulets = record(event?.exerciseResult)?.createdAmulets;
  return (
    Array.isArray(createdAmulets) &&
    createdAmulets.some(
      (created) => record(created)?.tag === "TransferResultAmulet",
    )
  );
}

function mutateReference(value: string, prefix: string): string {
  const first = value[prefix.length];
  if (first === undefined) return `${value}0`;
  return `${prefix}${first === "0" ? "1" : "0"}${value.slice(prefix.length + 1)}`;
}

export function evaluateReconciliationMutations(
  response: unknown,
  proof: SettlementProof,
  expected: ReconciliationExpectation,
) {
  const changedAttempt = mutateReference(proof.attemptId, "sha256:");
  const changedCommitment = mutateReference(proof.requestCommitment, "sha256:");
  const changedUpdate = mutateReference(proof.updateId, "1220");
  return {
    exactAccepted: reconcileSettlementTransaction(response, proof, expected),
    attemptMutationRejected: !reconcileSettlementTransaction(
      response,
      { ...proof, attemptId: changedAttempt as `sha256:${string}` },
      expected,
    ),
    recipientMutationRejected: !reconcileSettlementTransaction(
      response,
      proof,
      { ...expected, providerParty: `${expected.providerParty}-mutation` },
    ),
    requestCommitmentMutationRejected: !reconcileSettlementTransaction(
      response,
      {
        ...proof,
        requestCommitment: changedCommitment as `sha256:${string}`,
      },
      expected,
    ),
    updateMutationRejected: !reconcileSettlementTransaction(
      response,
      { ...proof, updateId: changedUpdate },
      expected,
    ),
  } as const;
}
