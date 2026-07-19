export function preparedTransferContextIds(
  candidate: unknown,
): ReadonlyMap<string, string> {
  const context = candidate as Readonly<{ values?: unknown }>;
  if (
    typeof context !== "object" ||
    context === null ||
    typeof context.values !== "object" ||
    context.values === null ||
    Array.isArray(context.values)
  ) {
    throw new Error("prepared Purchase context authority is invalid");
  }
  const entries = Object.entries(context.values).map(
    ([key, candidateValue]) => {
      if (
        typeof candidateValue !== "object" ||
        candidateValue === null ||
        Array.isArray(candidateValue)
      ) {
        throw new Error("prepared Purchase context value is invalid");
      }
      const record = candidateValue as Record<string, unknown>;
      if (
        Object.keys(record).sort().join(",") !== "tag,value" ||
        record.tag !== "AV_ContractId" ||
        typeof record.value !== "string" ||
        record.value === ""
      ) {
        throw new Error("prepared Purchase context value is not a contract ID");
      }
      return [key, record.value] as const;
    },
  );
  return new Map(entries);
}
