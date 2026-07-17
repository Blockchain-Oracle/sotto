import type { HumanSettlementExpectation } from "@sotto/x402-canton";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactKeys(
  value: Record<string, unknown> | undefined,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== undefined &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

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
  expected: Record<string, string>,
): boolean {
  const meta = record(candidate);
  const values = record(meta?.values);
  return (
    exactKeys(meta, ["values"]) &&
    exactKeys(values, Object.keys(expected)) &&
    Object.entries(expected).every(([key, value]) => values[key] === value)
  );
}

function exactInputs(
  candidate: unknown,
  expected: HumanSettlementExpectation,
): boolean {
  return (
    Array.isArray(candidate) &&
    candidate.length === expected.inputHoldingContractIds.length &&
    candidate.every((entry, index) => {
      const input = record(entry);
      return (
        exactKeys(input, ["tag", "value"]) &&
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
  const choice = record(candidate);
  const context = record(choice?.context);
  return (
    exactKeys(choice, [
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
    exactKeys(context, ["externalPartyConfigState", "featuredAppRight"]) &&
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
  const outer = record(candidate);
  const result = record(outer?.result);
  const created = result?.createdAmulets;
  return (
    exactKeys(outer, ["meta", "result"]) &&
    exactMetadata(outer.meta, {
      "splice.lfdecentralizedtrust.org/sender": expected.payerParty,
      "splice.lfdecentralizedtrust.org/tx-kind": "transfer",
      ...sottoMetadata(expected),
    }) &&
    Array.isArray(created) &&
    created.length === 1 &&
    exactKeys(record(created[0]), ["tag", "value"]) &&
    record(created[0])?.tag === "TransferResultAmulet" &&
    record(created[0])?.value === holdingContractId
  );
}

export function exactHumanSendV2CreatesHolding(
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
    JSON.stringify(send.actingParties) ===
      JSON.stringify([expected.payerParty]) &&
    exactChoice(send.choiceArgument, expected) &&
    linksHolding(send.exerciseResult, holdingContractId, expected)
  );
}
