import { atomicPurchaseCommandId } from "./atomic-purchase.js";
import { sottoTemplateId } from "./daml-template-ids.js";
import type { SettlementProof } from "./provider.js";
import {
  reconcileSettlementTransaction,
  type ReconciliationExpectation,
} from "./reconciliation.js";

export type AtomicReconciliationExpectation = Omit<
  ReconciliationExpectation,
  "commandId"
> &
  Readonly<{
    agentParty: string;
    ownerParty: string;
    policyCid: string;
    policyPackageId: string;
    policyRevision: string;
    remainingLimit: string;
    resourceHash: `sha256:${string}`;
  }>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function reconcileAtomicPurchaseTransaction(
  response: unknown,
  proof: SettlementProof,
  expected: AtomicReconciliationExpectation,
): boolean {
  if (
    !reconcileSettlementTransaction(response, proof, {
      ...expected,
      commandId: atomicPurchaseCommandId(proof),
    })
  ) {
    return false;
  }
  const events = record(record(response)?.transaction)?.events;
  if (!Array.isArray(events)) return false;
  const exercises = events
    .map((event) => record(record(event)?.ExercisedEvent))
    .filter((event) => event !== undefined);
  const policyTemplate = sottoTemplateId(
    expected.policyPackageId,
    "PurchasePolicyProbe",
  );
  const contextTemplate = sottoTemplateId(
    expected.policyPackageId,
    "PurchaseContextProbe",
  );
  const consumes = exercises.filter(
    (event) =>
      event.choice === "Consume" && event.templateId === policyTemplate,
  );
  if (consumes.length !== 1) return false;
  const consume = consumes[0];
  const argument = record(consume?.choiceArgument);
  if (
    consume?.contractId !== expected.policyCid ||
    argument?.amount !== expected.amount ||
    argument.attemptId !== proof.attemptId ||
    argument.requestCommitment !== proof.requestCommitment ||
    argument.resourceHash !== expected.resourceHash ||
    argument.recipient !== expected.providerParty
  ) {
    return false;
  }
  const created = events
    .map((event) => record(record(event)?.CreatedEvent))
    .filter((event) => event !== undefined);
  const contexts = created.filter(
    (event) => event.templateId === contextTemplate,
  );
  const policies = created.filter(
    (event) => event.templateId === policyTemplate,
  );
  if (contexts.length !== 1 || policies.length !== 1) return false;
  const context = record(contexts[0]?.createArgument);
  const policy = record(policies[0]?.createArgument);
  return (
    context?.agent === expected.agentParty &&
    context.owner === expected.ownerParty &&
    context.payer === expected.payerParty &&
    context.provider === expected.providerParty &&
    context.amount === expected.amount &&
    context.attemptId === proof.attemptId &&
    context.requestCommitment === proof.requestCommitment &&
    context.resourceHash === expected.resourceHash &&
    context.policyRevision === expected.policyRevision &&
    policy?.agent === expected.agentParty &&
    policy.owner === expected.ownerParty &&
    policy.payer === expected.payerParty &&
    policy.allowedRecipient === expected.providerParty &&
    policy.allowedResourceHash === expected.resourceHash &&
    policy.remainingLimit === expected.remainingLimit &&
    policy.revision === String(BigInt(expected.policyRevision) + 1n) &&
    Array.isArray(policy.usedAttemptIds) &&
    policy.usedAttemptIds.includes(proof.attemptId)
  );
}
