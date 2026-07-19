import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import { referenceHumanRecord } from "./reference-human-wallet-values.js";

export const REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID =
  "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f";

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function order(entries: ReadonlyArray<readonly [string, string]>) {
  return [...entries].sort(([left], [right]) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  );
}

function metadataEntries(
  value: Value | undefined,
  label: string,
): ReadonlyArray<readonly [string, string]> {
  const metadata = referenceHumanRecord(
    value,
    ["values"],
    label,
    `${REFERENCE_HUMAN_TOKEN_METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:Metadata`,
  );
  const values = metadata.get("values");
  if (values?.sum.oneofKind !== "textMap") fail(label);
  const entries = values.sum.textMap.entries.map(({ key, value: entry }) => {
    if (
      key === "" ||
      entry?.sum.oneofKind !== "text" ||
      Buffer.byteLength(key, "utf8") > 256 ||
      Buffer.byteLength(entry.sum.text, "utf8") > 4_096
    ) {
      fail(label);
    }
    return [key, entry.sum.text] as const;
  });
  if (
    entries.length > 128 ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    fail(label);
  }
  return order(entries);
}

function exactMetadata(
  value: Value | undefined,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  if (
    JSON.stringify(metadataEntries(value, label)) !==
    JSON.stringify(order(Object.entries(expected)))
  ) {
    fail(label);
  }
}

export function referenceHumanWalletTransferMetadata(
  request: HumanWalletApprovalRequest,
): Readonly<Record<string, string>> {
  const approval = request.approval;
  return Object.freeze({
    "sotto-x402/v1/attempt-id": approval.attemptId,
    "sotto-x402/v1/challenge-id": approval.challengeId,
    "sotto-x402/v1/purchase-commitment": approval.purchaseCommitment,
    "sotto-x402/v1/request-commitment": approval.requestCommitment,
  });
}

export function validateReferenceHumanWalletTransferMetadata(
  value: Value | undefined,
  request: HumanWalletApprovalRequest,
  label: string,
): void {
  exactMetadata(value, referenceHumanWalletTransferMetadata(request), label);
}

export function validateReferenceHumanWalletResultMetadata(
  value: Value | undefined,
  request: HumanWalletApprovalRequest,
  label: string,
): void {
  exactMetadata(
    value,
    {
      "splice.lfdecentralizedtrust.org/sender": request.approval.payerParty,
      "splice.lfdecentralizedtrust.org/tx-kind": "transfer",
      ...referenceHumanWalletTransferMetadata(request),
    },
    label,
  );
}

export function validateReferenceHumanWalletEmptyMetadata(
  value: Value | undefined,
  label: string,
): void {
  if (metadataEntries(value, label).length !== 0) fail(label);
}
