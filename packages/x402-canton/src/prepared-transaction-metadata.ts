import type { Create, Metadata } from "@canton-network/core-ledger-proto";
import { canonicalTime, identifier } from "./purchase-commitment-primitives.js";
import {
  type PreparedStructureBudget,
  validatePreparedValue,
} from "./prepared-purchase-limits.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import {
  MAX_PREPARED_EVENT_BLOB_BYTES,
  MAX_PREPARED_INPUT_CONTRACTS,
  MAX_TOTAL_PREPARED_EVENT_BLOB_BYTES,
} from "./prepared-purchase-resource-envelope.js";
import { preparedSynchronizerMatches } from "./prepared-synchronizer.js";

export type PreparedTransactionMetadataExpectation = Readonly<{
  actAs: readonly string[];
  commandId: string;
  executeBefore: string;
  requestedAt: string;
  synchronizerId: string;
}>;

function timestampMicros(value: string, label: string): bigint {
  return BigInt(canonicalTime(value, label)) * 1_000n;
}

function validateInputContracts(
  metadata: Metadata,
  budget: PreparedStructureBudget,
): PreparedPurchaseMetadata {
  if (metadata.inputContracts.length > MAX_PREPARED_INPUT_CONTRACTS) {
    throw new Error("prepared Purchase has too many input contracts");
  }
  const contracts = new Map<string, Create>();
  const eventBlobs = new Map<string, Uint8Array>();
  let totalEventBytes = 0;
  for (const input of metadata.inputContracts) {
    if (input.contract.oneofKind !== "v1") {
      throw new Error("prepared input contract version is unsupported");
    }
    const contractId = identifier(
      input.contract.v1.contractId,
      "prepared input contract ID",
      512,
    );
    if (contracts.has(contractId)) {
      throw new Error("prepared input contract IDs must be unique");
    }
    const contract = input.contract.v1;
    contracts.set(contractId, contract);
    eventBlobs.set(contractId, new Uint8Array(input.eventBlob));
    validatePreparedValue(contract.argument, budget);
    if (input.eventBlob.byteLength > MAX_PREPARED_EVENT_BLOB_BYTES) {
      throw new Error("prepared input event blob exceeds byte limit");
    }
    totalEventBytes += input.eventBlob.byteLength;
    if (totalEventBytes > MAX_TOTAL_PREPARED_EVENT_BLOB_BYTES) {
      throw new Error("prepared input event blobs exceed aggregate limit");
    }
  }
  return Object.freeze({
    inputContracts: contracts,
    inputEventBlobs: eventBlobs,
  });
}

export function validatePreparedTransactionMetadata(
  metadata: Metadata,
  expectation: PreparedTransactionMetadataExpectation,
  budget: PreparedStructureBudget,
): PreparedPurchaseMetadata {
  const submitter = metadata.submitterInfo;
  if (
    submitter === undefined ||
    JSON.stringify(submitter.actAs) !== JSON.stringify(expectation.actAs) ||
    submitter.commandId !== expectation.commandId
  ) {
    throw new Error("prepared submitter metadata does not match");
  }
  if (
    !preparedSynchronizerMatches(
      metadata.synchronizerId,
      expectation.synchronizerId,
    )
  ) {
    throw new Error("prepared synchronizer does not match");
  }
  identifier(metadata.transactionUuid, "prepared transaction UUID", 128);
  if (metadata.globalKeyMapping.length !== 0) {
    throw new Error("prepared global key mapping must be empty");
  }
  const requestedAt = timestampMicros(
    expectation.requestedAt,
    "prepared requestedAt",
  );
  const executeBefore = timestampMicros(
    expectation.executeBefore,
    "prepared executeBefore",
  );
  if (metadata.maxRecordTime !== executeBefore) {
    throw new Error("prepared max record time does not match");
  }
  const minimum = metadata.minLedgerEffectiveTime;
  const maximum = metadata.maxLedgerEffectiveTime;
  if (
    minimum === undefined ||
    maximum === undefined ||
    minimum < requestedAt ||
    metadata.preparationTime <= requestedAt ||
    metadata.preparationTime >= executeBefore ||
    maximum >= executeBefore ||
    minimum > maximum ||
    metadata.preparationTime < minimum ||
    metadata.preparationTime > maximum
  ) {
    throw new Error("prepared ledger-time bounds are invalid");
  }
  return validateInputContracts(metadata, budget);
}
