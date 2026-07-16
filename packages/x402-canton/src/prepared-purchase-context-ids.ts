import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";

export function preparedPurchaseContextIds(
  request: BoundedPurchasePrepareRequest,
): ReadonlyMap<string, string> {
  const context = request.commands[0]!.ExerciseCommand.choiceArgument.extraArgs
    .context as Readonly<{ values?: unknown }>;
  if (
    typeof context.values !== "object" ||
    context.values === null ||
    Array.isArray(context.values)
  ) {
    throw new Error("prepared Purchase context authority is invalid");
  }
  const entries = Object.entries(context.values).map(([key, candidate]) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      throw new Error("prepared Purchase context value is invalid");
    }
    const record = candidate as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(",") !== "tag,value" ||
      record.tag !== "AV_ContractId" ||
      typeof record.value !== "string" ||
      record.value === ""
    ) {
      throw new Error("prepared Purchase context value is not a contract ID");
    }
    return [key, record.value] as const;
  });
  return new Map(entries);
}
