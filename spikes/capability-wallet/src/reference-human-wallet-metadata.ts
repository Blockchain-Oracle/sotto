import type { Create, Metadata } from "@canton-network/core-ledger-proto";
import {
  preparedSynchronizerMatches,
  type HumanWalletApprovalRequest,
} from "@sotto/x402-canton";
import type { ReferenceHumanWalletRoot } from "./reference-human-wallet-root.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import { referenceHumanParties } from "./reference-human-wallet-values.js";

const MAX_INPUTS = 32;
const MAX_INPUT_BLOB_BYTES = 262_144;
const MAX_TOTAL_BLOB_BYTES = 2 * 1024 * 1024;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export type ReferenceHumanWalletMetadata = Readonly<{
  inputs: ReadonlyMap<string, Create>;
}>;

export function validateReferenceHumanWalletMetadata(
  metadata: Metadata,
  request: HumanWalletApprovalRequest,
  root: ReferenceHumanWalletRoot,
  transfer: ReferenceHumanWalletTransfer,
): ReferenceHumanWalletMetadata {
  const approval = request.approval;
  referenceHumanParties(
    metadata.submitterInfo?.actAs ?? [],
    [approval.payerParty],
    "submitter",
  );
  const executeBefore = BigInt(Date.parse(approval.executeBefore)) * 1_000n;
  if (
    metadata.submitterInfo?.commandId !==
      `sotto-human-purchase-v1-${approval.purchaseCommitment.slice(7)}` ||
    !preparedSynchronizerMatches(
      metadata.synchronizerId,
      approval.synchronizerId,
    ) ||
    metadata.maxRecordTime !== executeBefore ||
    metadata.preparationTime === undefined ||
    metadata.preparationTime <= root.requestedAtMicros ||
    metadata.preparationTime >= executeBefore ||
    metadata.minLedgerEffectiveTime === undefined ||
    metadata.minLedgerEffectiveTime < root.requestedAtMicros ||
    metadata.maxLedgerEffectiveTime === undefined ||
    metadata.maxLedgerEffectiveTime < metadata.minLedgerEffectiveTime ||
    metadata.maxLedgerEffectiveTime >= executeBefore ||
    metadata.globalKeyMapping.length !== 0 ||
    metadata.inputContracts.length === 0 ||
    metadata.inputContracts.length > MAX_INPUTS
  ) {
    fail("metadata");
  }
  const inputs = new Map<string, Create>();
  let totalBlobBytes = 0;
  for (const entry of metadata.inputContracts) {
    if (
      entry.contract.oneofKind !== "v1" ||
      entry.contract.v1.contractId === "" ||
      entry.contract.v1.lfVersion !== "2.1" ||
      entry.contract.v1.packageName !== "splice-amulet" ||
      entry.eventBlob.byteLength === 0 ||
      entry.eventBlob.byteLength > MAX_INPUT_BLOB_BYTES ||
      inputs.has(entry.contract.v1.contractId)
    ) {
      fail("metadata input");
    }
    totalBlobBytes += entry.eventBlob.byteLength;
    inputs.set(entry.contract.v1.contractId, entry.contract.v1);
  }
  if (totalBlobBytes > MAX_TOTAL_BLOB_BYTES) fail("metadata input blobs");
  const expected = new Set([
    approval.tokenFactory.contractId,
    ...transfer.inputHoldingIds,
    transfer.contractId,
    transfer.configContractId,
    transfer.featuredContractId,
  ]);
  if (
    expected.size !== inputs.size ||
    [...inputs.keys()].some((contractId) => !expected.has(contractId))
  ) {
    fail("metadata input set");
  }
  return Object.freeze({ inputs });
}
