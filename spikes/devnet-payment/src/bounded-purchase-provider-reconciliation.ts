import type { SettlementProof } from "./provider.js";
import { exactTransferCreatesHolding } from "./bounded-purchase-provider-transfer.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;
const UPDATE = /^1220[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)\.[0-9]{10}$/u;

export type BoundedPurchaseProviderExpectation = Readonly<{
  agentParty: string;
  amuletTemplateId: string;
  amount: string;
  capabilityRevision: string;
  challengeId: `sha256:${string}`;
  dsoParty: string;
  inputHoldingContractIds: readonly string[];
  packageId: string;
  payerParty: string;
  providerParty: string;
  purchaseCommitment: `sha256:${string}`;
  resourceHash: `sha256:${string}`;
  synchronizerId: string;
  transferContext: Readonly<{
    externalPartyConfigState: string;
    featuredAppRight: string;
  }>;
  transferPreapprovalContractId: string;
  transferPreapprovalTemplateId: string;
}>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort())
  );
}

function createdEvents(events: unknown[]) {
  return events.flatMap((wrapper) => {
    const event = record(record(wrapper)?.CreatedEvent);
    return event === undefined ? [] : [event];
  });
}

function exercisedEvents(events: unknown[]) {
  return events.flatMap((wrapper) => {
    const event = record(record(wrapper)?.ExercisedEvent);
    return event === undefined ? [] : [event];
  });
}

function matchingContext(
  created: Record<string, unknown>[],
  proof: SettlementProof,
  expected: BoundedPurchaseProviderExpectation,
): boolean {
  const templateId = `${expected.packageId}:Sotto.Control.PurchaseCapability:PurchaseContext`;
  const contexts = created.filter((event) => event.templateId === templateId);
  if (contexts.length !== 1) return false;
  const argument = record(contexts[0]?.createArgument);
  return (
    argument !== undefined &&
    exactKeys(argument, [
      "agent",
      "amount",
      "attemptId",
      "capabilityRevision",
      "challengeId",
      "payer",
      "provider",
      "purchaseCommitment",
      "requestCommitment",
      "resourceHash",
      "totalDebit",
    ]) &&
    argument.agent === expected.agentParty &&
    argument.amount === expected.amount &&
    argument.attemptId === proof.attemptId &&
    argument.payer === expected.payerParty &&
    argument.provider === expected.providerParty &&
    argument.requestCommitment === proof.requestCommitment &&
    argument.resourceHash === expected.resourceHash &&
    argument.totalDebit === expected.amount &&
    argument.challengeId === expected.challengeId &&
    argument.purchaseCommitment === expected.purchaseCommitment &&
    argument.capabilityRevision === expected.capabilityRevision
  );
}

function providerHolding(
  created: Record<string, unknown>[],
  expected: BoundedPurchaseProviderExpectation,
): string | undefined {
  const holdings = created.filter((event) => {
    if (event.templateId !== expected.amuletTemplateId) {
      return false;
    }
    const argument = record(event.createArgument);
    const amount = record(argument?.amount);
    const round = record(amount?.createdAt);
    const rate = record(amount?.ratePerRound);
    return (
      argument?.dso === expected.dsoParty &&
      argument.owner === expected.providerParty &&
      amount?.initialAmount === expected.amount &&
      typeof round?.number === "string" &&
      /^(?:0|[1-9][0-9]*)$/u.test(round.number) &&
      typeof rate?.rate === "string" &&
      DECIMAL.test(rate.rate)
    );
  });
  return holdings.length === 1 && typeof holdings[0]?.contractId === "string"
    ? holdings[0].contractId
    : undefined;
}

export function reconcileBoundedPurchaseProviderTransaction(
  response: unknown,
  proof: SettlementProof,
  expected: BoundedPurchaseProviderExpectation,
): boolean {
  if (
    !UPDATE.test(proof.updateId) ||
    !HASH.test(proof.attemptId) ||
    !HASH.test(proof.requestCommitment) ||
    !DECIMAL.test(expected.amount) ||
    !HASH.test(expected.resourceHash) ||
    !HASH.test(expected.challengeId) ||
    !HASH.test(expected.purchaseCommitment) ||
    !/^(?:0|[1-9][0-9]{0,18})$/u.test(expected.capabilityRevision) ||
    !/^[0-9a-f]{64}$/u.test(expected.packageId) ||
    !/^[0-9a-f]{64}:Splice\.Amulet:Amulet$/u.test(expected.amuletTemplateId) ||
    !/^[0-9a-f]{64}:Splice\.AmuletRules:TransferPreapproval$/u.test(
      expected.transferPreapprovalTemplateId,
    ) ||
    expected.inputHoldingContractIds.length === 0 ||
    expected.inputHoldingContractIds.length > 16 ||
    new Set(expected.inputHoldingContractIds).size !==
      expected.inputHoldingContractIds.length
  ) {
    return false;
  }
  const transaction = record(record(response)?.transaction);
  const events = transaction?.events;
  if (
    transaction?.updateId !== proof.updateId ||
    transaction.synchronizerId !== expected.synchronizerId ||
    !Number.isSafeInteger(transaction.offset) ||
    !Array.isArray(events) ||
    events.length < 3 ||
    events.length > 128
  ) {
    return false;
  }
  const created = createdEvents(events);
  const exercises = exercisedEvents(events);
  const holdingCid = providerHolding(created, expected);
  return (
    holdingCid !== undefined &&
    matchingContext(created, proof, expected) &&
    exactTransferCreatesHolding(exercises, holdingCid, expected)
  );
}
