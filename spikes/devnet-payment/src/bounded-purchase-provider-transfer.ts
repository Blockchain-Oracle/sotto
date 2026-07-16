type TransferExpectation = Readonly<{
  amount: string;
  inputHoldingContractIds: readonly string[];
  payerParty: string;
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
  value: Record<string, unknown> | undefined,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== undefined &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function matchesChoiceArgument(
  value: unknown,
  expected: TransferExpectation,
): boolean {
  const argument = record(value);
  if (
    !exactKeys(argument, [
      "amount",
      "context",
      "description",
      "inputs",
      "meta",
      "sender",
    ]) ||
    argument.amount !== expected.amount ||
    argument.description !== null ||
    argument.sender !== expected.payerParty
  ) {
    return false;
  }
  const context = record(argument.context);
  const meta = record(argument.meta);
  const values = record(meta?.values);
  if (
    !exactKeys(context, ["externalPartyConfigState", "featuredAppRight"]) ||
    context.externalPartyConfigState !==
      expected.transferContext.externalPartyConfigState ||
    context.featuredAppRight !== expected.transferContext.featuredAppRight ||
    !exactKeys(meta, ["values"]) ||
    !exactKeys(values, []) ||
    !Array.isArray(argument.inputs) ||
    argument.inputs.length !== expected.inputHoldingContractIds.length
  ) {
    return false;
  }
  return argument.inputs.every((candidate, index) => {
    const input = record(candidate);
    return (
      exactKeys(input, ["tag", "value"]) &&
      input.tag === "InputAmulet" &&
      input.value === expected.inputHoldingContractIds[index]
    );
  });
}

function linksCreatedHolding(value: unknown, holdingCid: string): boolean {
  const result = record(record(value)?.result);
  const created = result?.createdAmulets;
  return (
    Array.isArray(created) &&
    created.length === 1 &&
    exactKeys(record(created[0]), ["tag", "value"]) &&
    record(created[0])?.tag === "TransferResultAmulet" &&
    record(created[0])?.value === holdingCid
  );
}

export function exactTransferCreatesHolding(
  exercises: Record<string, unknown>[],
  holdingCid: string,
  expected: TransferExpectation,
): boolean {
  const transfers = exercises.filter(
    (event) =>
      event.choice === "TransferPreapproval_SendV2" &&
      event.contractId === expected.transferPreapprovalContractId &&
      event.templateId === expected.transferPreapprovalTemplateId,
  );
  if (transfers.length !== 1) return false;
  const transfer = transfers[0]!;
  return (
    transfer.consuming === false &&
    JSON.stringify(transfer.actingParties) ===
      JSON.stringify([expected.payerParty]) &&
    matchesChoiceArgument(transfer.choiceArgument, expected) &&
    linksCreatedHolding(transfer.exerciseResult, holdingCid)
  );
}
