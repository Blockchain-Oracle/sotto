import type { HumanSettlementExpectation } from "./human-settlement-expectation.js";
import {
  settlementDenseArray,
  settlementExactKeys,
  settlementRecord,
} from "./human-provider-settlement-primitives.js";

function sottoMetadata(expected: HumanSettlementExpectation) {
  return {
    "sotto-x402/v1/attempt-id": expected.attemptId,
    "sotto-x402/v1/challenge-id": expected.challengeId,
    "sotto-x402/v1/purchase-commitment": expected.purchaseCommitment,
    "sotto-x402/v1/request-commitment": expected.requestCommitment,
  };
}

function exactMetadata(
  candidate: unknown,
  expected: Readonly<Record<string, string>>,
): boolean {
  const meta = settlementRecord(candidate);
  const values = settlementRecord(meta?.values);
  return (
    settlementExactKeys(meta, ["values"]) &&
    settlementExactKeys(values, Object.keys(expected)) &&
    Object.entries(expected).every(([key, value]) => values[key] === value)
  );
}

function exactInputs(
  candidate: unknown,
  expected: HumanSettlementExpectation,
): boolean {
  return (
    settlementDenseArray(
      candidate,
      expected.inputHoldingContractIds.length,
      expected.inputHoldingContractIds.length,
    ) &&
    candidate.every((entry, index) => {
      const input = settlementRecord(entry);
      return (
        settlementExactKeys(input, ["tag", "value"]) &&
        input.tag === "InputAmulet" &&
        input.value === expected.inputHoldingContractIds[index]
      );
    })
  );
}

function exactChoice(
  candidate: unknown,
  expected: HumanSettlementExpectation,
): boolean {
  const choice = settlementRecord(candidate);
  const context = settlementRecord(choice?.context);
  return (
    settlementExactKeys(choice, [
      "amount",
      "context",
      "description",
      "inputs",
      "meta",
      "sender",
    ]) &&
    choice.amount === expected.amount &&
    choice.description === null &&
    choice.sender === expected.payerParty &&
    settlementExactKeys(context, [
      "externalPartyConfigState",
      "featuredAppRight",
    ]) &&
    context.externalPartyConfigState ===
      expected.choiceContextContractIds["external-party-config-state"] &&
    context.featuredAppRight ===
      expected.choiceContextContractIds["featured-app-right"] &&
    exactInputs(choice.inputs, expected) &&
    exactMetadata(choice.meta, sottoMetadata(expected))
  );
}

function linksHolding(
  candidate: unknown,
  holdingContractId: string,
  expected: HumanSettlementExpectation,
): boolean {
  const outer = settlementRecord(candidate);
  const result = settlementRecord(outer?.result);
  const created = result?.createdAmulets;
  const createdHolding = settlementDenseArray(created, 1, 1)
    ? settlementRecord(created[0])
    : undefined;
  return (
    settlementExactKeys(outer, ["meta", "result"]) &&
    exactMetadata(outer.meta, {
      "splice.lfdecentralizedtrust.org/sender": expected.payerParty,
      "splice.lfdecentralizedtrust.org/tx-kind": "transfer",
      ...sottoMetadata(expected),
    }) &&
    settlementExactKeys(createdHolding, ["tag", "value"]) &&
    createdHolding.tag === "TransferResultAmulet" &&
    createdHolding.value === holdingContractId
  );
}

export function exactHumanProviderSendV2(
  exercises: readonly Record<string, unknown>[],
  holdingContractId: string,
  expected: HumanSettlementExpectation,
): boolean {
  const sends = exercises.filter(
    (event) => event.choice === "TransferPreapproval_SendV2",
  );
  if (sends.length !== 1) return false;
  const send = sends[0]!;
  return (
    send.contractId === expected.transferPreapprovalContractId &&
    send.templateId === expected.transferPreapprovalTemplateId &&
    send.consuming === false &&
    settlementDenseArray(send.actingParties, 1, 1) &&
    send.actingParties[0] === expected.payerParty &&
    exactChoice(send.choiceArgument, expected) &&
    linksHolding(send.exerciseResult, holdingContractId, expected)
  );
}
