import { createHash } from "node:crypto";
import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type {
  HumanPurchaseLedgerIntent,
  HumanPurchasePrepareRequest,
} from "@sotto/x402-canton";
import { humanPreparedPurchaseBytes } from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";

export const LEGACY_CONTEXT_IDS = [
  "00external-party-config-state",
  "00featured-app-right",
  "00round",
  "00transfer-preapproval",
] as const;

export function cantonContractId(label: string): string {
  return `00${createHash("sha256").update(`real-wallet:${label}`).digest("hex")}`;
}

export function rewriteStrings(
  value: unknown,
  replace: (value: string) => string,
) {
  if (typeof value === "string") return replace(value);
  if (
    typeof value !== "object" ||
    value === null ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      value[index] = rewriteStrings(entry, replace);
    });
    return value;
  }
  for (const [key, entry] of Object.entries(value)) {
    (value as Record<string, unknown>)[key] = rewriteStrings(entry, replace);
  }
  return value;
}

function rewritePreparedContractIds(value: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => rewritePreparedContractIds(entry));
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (key === "contractId" && typeof entry === "string") {
      record[key] = /^00[0-9a-f]{64}$/u.test(entry)
        ? entry
        : cantonContractId(entry);
    } else if (
      key === "value" &&
      record.tag === "AV_ContractId" &&
      typeof entry === "string"
    ) {
      record[key] = /^00[0-9a-f]{64}$/u.test(entry)
        ? entry
        : cantonContractId(entry);
    } else {
      rewritePreparedContractIds(entry);
    }
  }
  return value;
}

export function sdkCompatiblePreparedTransaction(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  contextIds: ReadonlyMap<string, string>,
): Uint8Array {
  const reverse = new Map(
    [...contextIds].map(([legacy, valid]) => [valid, legacy]),
  );
  const legacyRequest = structuredClone(request);
  rewriteStrings(legacyRequest, (value) => reverse.get(value) ?? value);
  const prepared = PreparedTransaction.fromBinary(
    humanPreparedPurchaseBytes(intent, legacyRequest),
    { readUnknownField: "throw" },
  );
  rewritePreparedContractIds(prepared);
  const disclosures = new Map(
    request.disclosedContracts.map(({ contractId, createdEventBlob }) => [
      contractId,
      createdEventBlob,
    ]),
  );
  for (const input of prepared.metadata?.inputContracts ?? []) {
    if (input.contract.oneofKind !== "v1") continue;
    const eventBlob = disclosures.get(input.contract.v1.contractId);
    if (eventBlob !== undefined) {
      input.eventBlob = Buffer.from(eventBlob, "base64");
    }
  }
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}
