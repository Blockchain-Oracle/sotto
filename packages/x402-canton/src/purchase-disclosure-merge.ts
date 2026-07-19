import type { ValidatedDisclosedContract } from "./purchase-holding-types.js";

export const MAX_PREPARE_DISCLOSURES = 32;
export const MAX_TOTAL_PREPARE_DISCLOSURE_BYTES = 2_097_152;

function equalDisclosure(
  left: ValidatedDisclosedContract,
  right: ValidatedDisclosedContract,
): boolean {
  return (
    left.templateId === right.templateId &&
    left.contractId === right.contractId &&
    left.createdEventBlob === right.createdEventBlob &&
    left.synchronizerId === right.synchronizerId
  );
}

export function mergePurchaseDisclosures(
  ...groups: readonly (readonly ValidatedDisclosedContract[])[]
): readonly ValidatedDisclosedContract[] {
  const merged = new Map<string, ValidatedDisclosedContract>();
  for (const contract of groups.flat()) {
    const current = merged.get(contract.contractId);
    if (current !== undefined && !equalDisclosure(current, contract)) {
      throw new Error("purchase disclosure contractId has conflicting values");
    }
    merged.set(contract.contractId, contract);
  }
  if (merged.size > MAX_PREPARE_DISCLOSURES) {
    throw new Error("purchase disclosures exceed count limit");
  }
  const result = [...merged.values()].sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.contractId, "utf8"),
      Buffer.from(right.contractId, "utf8"),
    ),
  );
  const decodedBytes = result.reduce(
    (total, contract) =>
      total + Buffer.from(contract.createdEventBlob, "base64").byteLength,
    0,
  );
  if (decodedBytes > MAX_TOTAL_PREPARE_DISCLOSURE_BYTES) {
    throw new Error("purchase disclosures exceed total byte limit");
  }
  return Object.freeze(
    result.map((contract) => Object.freeze({ ...contract })),
  );
}
