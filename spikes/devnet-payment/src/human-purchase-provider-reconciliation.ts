import {
  readAuthenticatedHumanSettlementExpectation,
  type HumanSettlementExpectation,
} from "@sotto/x402-canton";
import { exactHumanSendV2CreatesHolding } from "./human-purchase-provider-transfer.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;
const UPDATE = /^1220[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)\.[0-9]{10}$/u;

export type HumanPurchaseSettlementProof = Readonly<{
  attemptId: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  updateId: string;
}>;

export const AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION =
  "sotto-authenticated-human-provider-settlement-v1" as const;

declare const authenticatedHumanProviderSettlementBrand: unique symbol;
export type AuthenticatedHumanPurchaseProviderSettlement = Readonly<{
  version: typeof AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION;
  readonly [authenticatedHumanProviderSettlementBrand]: true;
}>;

const authenticatedSettlements = new WeakMap<
  object,
  HumanPurchaseSettlementProof
>();

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort())
  );
}

function exactProof(
  candidate: unknown,
  expected: HumanSettlementExpectation,
): candidate is HumanPurchaseSettlementProof {
  const proof = record(candidate);
  return (
    proof !== undefined &&
    exactKeys(proof, [
      "attemptId",
      "challengeId",
      "purchaseCommitment",
      "requestCommitment",
      "updateId",
    ]) &&
    typeof proof.attemptId === "string" &&
    HASH.test(proof.attemptId) &&
    proof.attemptId === expected.attemptId &&
    typeof proof.challengeId === "string" &&
    HASH.test(proof.challengeId) &&
    proof.challengeId === expected.challengeId &&
    typeof proof.requestCommitment === "string" &&
    HASH.test(proof.requestCommitment) &&
    proof.requestCommitment === expected.requestCommitment &&
    typeof proof.purchaseCommitment === "string" &&
    HASH.test(proof.purchaseCommitment) &&
    proof.purchaseCommitment === expected.purchaseCommitment &&
    typeof proof.updateId === "string" &&
    UPDATE.test(proof.updateId)
  );
}

function eventsOfKind(
  events: readonly unknown[],
  kind: "CreatedEvent" | "ExercisedEvent",
): Record<string, unknown>[] {
  return events.flatMap((wrapper) => {
    const event = record(record(wrapper)?.[kind]);
    return event === undefined ? [] : [event];
  });
}

function providerHolding(
  created: readonly Record<string, unknown>[],
  expected: HumanSettlementExpectation,
): string | undefined {
  const candidates = created.filter((event) => {
    const argument = record(event.createArgument);
    return (
      event.templateId === expected.amuletTemplateId &&
      argument?.owner === expected.providerParty
    );
  });
  if (candidates.length !== 1) return undefined;
  const event = candidates[0]!;
  const argument = record(event.createArgument);
  const amount = record(argument?.amount);
  const round = record(amount?.createdAt);
  const rate = record(amount?.ratePerRound);
  return argument !== undefined &&
    exactKeys(argument, ["amount", "dso", "owner"]) &&
    argument.dso === expected.dsoParty &&
    amount !== undefined &&
    exactKeys(amount, ["createdAt", "initialAmount", "ratePerRound"]) &&
    amount.initialAmount === expected.amount &&
    round !== undefined &&
    exactKeys(round, ["number"]) &&
    typeof round.number === "string" &&
    /^(?:0|[1-9][0-9]*)$/u.test(round.number) &&
    rate !== undefined &&
    exactKeys(rate, ["rate"]) &&
    typeof rate.rate === "string" &&
    DECIMAL.test(rate.rate) &&
    typeof event.contractId === "string" &&
    event.contractId !== ""
    ? event.contractId
    : undefined;
}

export function reconcileHumanPurchaseProviderTransaction(
  response: unknown,
  proof: HumanPurchaseSettlementProof,
  candidateExpectation: HumanSettlementExpectation,
): boolean {
  let expected: HumanSettlementExpectation;
  try {
    expected =
      readAuthenticatedHumanSettlementExpectation(candidateExpectation);
  } catch {
    return false;
  }
  if (!exactProof(proof, expected) || !DECIMAL.test(expected.amount)) {
    return false;
  }
  const transaction = record(record(response)?.transaction);
  const events = transaction?.events;
  if (
    transaction?.updateId !== proof.updateId ||
    transaction === undefined ||
    (Object.hasOwn(transaction, "commandId") &&
      transaction.commandId !== "" &&
      transaction.commandId !== expected.commandId) ||
    transaction.synchronizerId !== expected.synchronizerId ||
    !Number.isSafeInteger(transaction.offset) ||
    !Array.isArray(events) ||
    events.length < 2 ||
    events.length > 128
  ) {
    return false;
  }
  const created = eventsOfKind(events, "CreatedEvent");
  const exercises = eventsOfKind(events, "ExercisedEvent");
  const holdingContractId = providerHolding(created, expected);
  return (
    holdingContractId !== undefined &&
    exactHumanSendV2CreatesHolding(exercises, holdingContractId, expected)
  );
}

export function authenticateHumanPurchaseProviderSettlement(
  response: unknown,
  proof: HumanPurchaseSettlementProof,
  expectation: HumanSettlementExpectation,
): AuthenticatedHumanPurchaseProviderSettlement {
  let snapshot: HumanPurchaseSettlementProof;
  try {
    snapshot = Object.freeze(structuredClone(proof));
  } catch {
    throw new Error("human provider settlement did not reconcile");
  }
  if (
    !reconcileHumanPurchaseProviderTransaction(response, snapshot, expectation)
  ) {
    throw new Error("human provider settlement did not reconcile");
  }
  const settlement = Object.freeze({
    version: AUTHENTICATED_HUMAN_PROVIDER_SETTLEMENT_VERSION,
  }) as AuthenticatedHumanPurchaseProviderSettlement;
  authenticatedSettlements.set(settlement, snapshot);
  return settlement;
}

export function readAuthenticatedHumanPurchaseProviderSettlement(
  candidate: unknown,
): HumanPurchaseSettlementProof {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human provider settlement is not authenticated");
  }
  const proof = authenticatedSettlements.get(candidate);
  if (proof === undefined) {
    throw new Error("human provider settlement is not authenticated");
  }
  return proof;
}
