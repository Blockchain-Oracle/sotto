import type { HumanSettlementExpectation } from "./human-settlement-expectation.js";
import {
  settlementContractId,
  settlementDenseArray,
  settlementExactKeys,
  settlementIdentifier,
  settlementRecord,
} from "./human-provider-settlement-primitives.js";
import { exactHumanProviderSendV2 } from "./human-provider-settlement-send-v2.js";
import type { HumanPurchaseSettlementProof } from "./human-provider-settlement-types.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;
const UPDATE = /^1220[0-9a-f]{64}$/u;
const NATURAL = /^(?:0|[1-9][0-9]{0,18})$/u;
const DECIMAL = /^(?:0|[1-9][0-9]{0,27})\.[0-9]{10}$/u;
const MAX_INT64 = 9_223_372_036_854_775_807n;

function exactProof(
  candidate: unknown,
  expected: HumanSettlementExpectation,
): candidate is HumanPurchaseSettlementProof {
  const proof = settlementRecord(candidate);
  return (
    settlementExactKeys(proof, [
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

function classifyEvents(events: unknown[]):
  | Readonly<{
      created: Record<string, unknown>[];
      exercises: Record<string, unknown>[];
    }>
  | undefined {
  const created: Record<string, unknown>[] = [];
  const exercises: Record<string, unknown>[] = [];
  const createdContractIds = new Set<string>();
  for (const candidate of events) {
    const wrapper = settlementRecord(candidate);
    if (wrapper === undefined || Object.keys(wrapper).length !== 1) {
      return undefined;
    }
    if (Object.hasOwn(wrapper, "CreatedEvent")) {
      const event = settlementRecord(wrapper.CreatedEvent);
      if (
        event === undefined ||
        !settlementContractId(event.contractId, createdContractIds) ||
        !settlementIdentifier(event.templateId) ||
        settlementRecord(event.createArgument) === undefined
      ) {
        return undefined;
      }
      createdContractIds.add(event.contractId);
      created.push(event);
    } else if (Object.hasOwn(wrapper, "ExercisedEvent")) {
      const event = settlementRecord(wrapper.ExercisedEvent);
      if (
        event === undefined ||
        !settlementContractId(event.contractId, new Set()) ||
        !settlementIdentifier(event.templateId) ||
        !settlementIdentifier(event.choice) ||
        typeof event.consuming !== "boolean" ||
        !settlementDenseArray(event.actingParties, 0, 16) ||
        !event.actingParties.every((party) => settlementIdentifier(party)) ||
        settlementRecord(event.choiceArgument) === undefined ||
        settlementRecord(event.exerciseResult) === undefined
      ) {
        return undefined;
      }
      exercises.push(event);
    } else {
      return undefined;
    }
  }
  return { created, exercises };
}

function validRound(value: unknown): boolean {
  if (typeof value !== "string" || !NATURAL.test(value)) return false;
  return BigInt(value) <= MAX_INT64;
}

function providerHolding(
  created: readonly Record<string, unknown>[],
  expected: HumanSettlementExpectation,
): string | undefined {
  const candidates = created.filter((event) => {
    const argument = settlementRecord(event.createArgument);
    return (
      event.templateId === expected.amuletTemplateId &&
      argument?.owner === expected.providerParty
    );
  });
  if (candidates.length !== 1) return undefined;
  const event = candidates[0]!;
  const argument = settlementRecord(event.createArgument);
  const amount = settlementRecord(argument?.amount);
  const round = settlementRecord(amount?.createdAt);
  const rate = settlementRecord(amount?.ratePerRound);
  const forbidden = new Set([
    ...expected.inputHoldingContractIds,
    ...Object.values(expected.choiceContextContractIds),
    expected.transferFactoryContractId,
    expected.transferPreapprovalContractId,
  ]);
  return settlementExactKeys(argument, ["amount", "dso", "owner"]) &&
    argument.dso === expected.dsoParty &&
    settlementExactKeys(amount, [
      "createdAt",
      "initialAmount",
      "ratePerRound",
    ]) &&
    amount.initialAmount === expected.amount &&
    settlementExactKeys(round, ["number"]) &&
    validRound(round.number) &&
    settlementExactKeys(rate, ["rate"]) &&
    typeof rate.rate === "string" &&
    DECIMAL.test(rate.rate) &&
    settlementContractId(event.contractId, forbidden)
    ? event.contractId
    : undefined;
}

export function verifyHumanProviderSettlementTransaction(
  response: unknown,
  proof: HumanPurchaseSettlementProof,
  expected: HumanSettlementExpectation,
): number | undefined {
  if (!exactProof(proof, expected) || !DECIMAL.test(expected.amount)) {
    return undefined;
  }
  const transaction = settlementRecord(settlementRecord(response)?.transaction);
  const events = transaction?.events;
  if (
    transaction === undefined ||
    transaction.updateId !== proof.updateId ||
    (Object.hasOwn(transaction, "commandId") &&
      transaction.commandId !== "" &&
      transaction.commandId !== expected.commandId) ||
    transaction.synchronizerId !== expected.synchronizerId ||
    !Number.isSafeInteger(transaction.offset) ||
    (transaction.offset as number) < 0 ||
    !settlementDenseArray(events, 2, 128)
  ) {
    return undefined;
  }
  const classified = classifyEvents(events);
  if (classified === undefined) return undefined;
  const holdingContractId = providerHolding(classified.created, expected);
  return holdingContractId !== undefined &&
    exactHumanProviderSendV2(classified.exercises, holdingContractId, expected)
    ? (transaction.offset as number)
    : undefined;
}
