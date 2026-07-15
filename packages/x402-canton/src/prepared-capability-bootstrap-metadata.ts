import type { Metadata } from "@canton-network/core-ledger-proto";
import type { BoundedCapabilityBootstrapPrepareRequest } from "./bounded-capability-bootstrap-prepare.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CLOCK_TOLERANCE_MICROS = 5_000_000n;

function micros(value: string): bigint {
  return BigInt(Date.parse(value)) * 1_000n;
}

export function validatePreparedCapabilityBootstrapMetadata(
  metadata: Metadata,
  request: BoundedCapabilityBootstrapPrepareRequest,
): void {
  const submitter = metadata.submitterInfo;
  if (
    submitter === undefined ||
    JSON.stringify(submitter.actAs) !== JSON.stringify(request.actAs) ||
    submitter.commandId !== request.commandId
  ) {
    throw new Error("prepared capability submitter metadata does not match");
  }
  if (metadata.synchronizerId !== request.synchronizerId) {
    throw new Error("prepared capability synchronizer does not match");
  }
  if (
    !Number.isInteger(metadata.mediatorGroup) ||
    metadata.mediatorGroup < 0 ||
    metadata.mediatorGroup > 4_294_967_295 ||
    !UUID_PATTERN.test(metadata.transactionUuid)
  ) {
    throw new Error("prepared capability participant metadata is invalid");
  }
  if (
    metadata.inputContracts.length !== 0 ||
    metadata.globalKeyMapping.length !== 0
  ) {
    throw new Error("prepared capability must not contain hidden effects");
  }
  const validatedAt = micros(request.maxRecordTime) - 300_000_000n;
  const now = BigInt(Date.now()) * 1_000n;
  const maxRecordTime = micros(request.maxRecordTime);
  if (
    metadata.preparationTime < validatedAt ||
    metadata.preparationTime > now + CLOCK_TOLERANCE_MICROS ||
    metadata.preparationTime >= maxRecordTime ||
    metadata.maxRecordTime !== maxRecordTime
  ) {
    throw new Error("prepared capability record-time bounds are invalid");
  }
  const minimum = metadata.minLedgerEffectiveTime;
  const maximum = metadata.maxLedgerEffectiveTime;
  if (
    (minimum === undefined) !== (maximum === undefined) ||
    (minimum !== undefined &&
      maximum !== undefined &&
      (minimum > metadata.preparationTime ||
        maximum < metadata.preparationTime ||
        minimum > maximum ||
        maximum >= maxRecordTime))
  ) {
    throw new Error("prepared capability ledger-time bounds are invalid");
  }
}
