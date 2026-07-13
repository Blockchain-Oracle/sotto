import type { Value } from "@canton-network/core-ledger-proto";

export const MAX_PREPARED_STRUCTURE_ITEMS = 65_536;
export const MAX_PREPARED_VALUE_DEPTH = 64;

export type PreparedStructureBudget = { items: number };

export function consumePreparedStructure(
  budget: PreparedStructureBudget,
  count = 1,
): void {
  budget.items += count;
  if (budget.items > MAX_PREPARED_STRUCTURE_ITEMS) {
    throw new Error("prepared value exceeds structural limits");
  }
}

function push(
  pending: Array<readonly [Value, number]>,
  value: Value | undefined,
  depth: number,
): void {
  if (value === undefined) throw new Error("prepared value is incomplete");
  pending.push([value, depth]);
}

export function validatePreparedValue(
  root: Value | undefined,
  budget: PreparedStructureBudget,
): void {
  if (root === undefined) return;
  const pending: Array<readonly [Value, number]> = [[root, 1]];
  while (pending.length > 0) {
    const [value, depth] = pending.pop()!;
    if (depth > MAX_PREPARED_VALUE_DEPTH) {
      throw new Error("prepared value exceeds structural limits");
    }
    consumePreparedStructure(budget);
    const sum = value.sum;
    if (sum.oneofKind === "optional") {
      if (sum.optional.value !== undefined) {
        pending.push([sum.optional.value, depth + 1]);
      }
    } else if (sum.oneofKind === "list") {
      for (const element of sum.list.elements)
        pending.push([element, depth + 1]);
    } else if (sum.oneofKind === "textMap") {
      const keys = new Set<string>();
      for (const entry of sum.textMap.entries) {
        if (keys.has(entry.key))
          throw new Error("prepared text-map keys repeat");
        keys.add(entry.key);
        push(pending, entry.value, depth + 1);
      }
    } else if (sum.oneofKind === "genMap") {
      for (const entry of sum.genMap.entries) {
        push(pending, entry.key, depth + 1);
        push(pending, entry.value, depth + 1);
      }
    } else if (sum.oneofKind === "record") {
      const labels = new Set<string>();
      for (const field of sum.record.fields) {
        if (field.label && labels.has(field.label)) {
          throw new Error("prepared record labels repeat");
        }
        if (field.label) labels.add(field.label);
        push(pending, field.value, depth + 1);
      }
    } else if (sum.oneofKind === "variant") {
      push(pending, sum.variant.value, depth + 1);
    } else if (sum.oneofKind === undefined) {
      throw new Error("prepared value type is absent");
    }
  }
}
