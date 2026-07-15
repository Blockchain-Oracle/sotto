import type { Metadata } from "@canton-network/core-ledger-proto";
import type { SerializedReferenceWalletRequest } from "./reference-wallet-types.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CLOCK_TOLERANCE_MICROS = 5_000_000n;
const MAX_RECORD_WINDOW_MICROS = 5n * 60n * 1_000_000n;

export function verifyReferenceWalletPreparedMetadata(
  metadata: Metadata,
  request: SerializedReferenceWalletRequest,
  intentHash: string,
): void {
  const approval = request.approval;
  if (
    metadata.submitterInfo?.commandId !==
      `sotto-capability-bootstrap-v1-${intentHash}` ||
    JSON.stringify(metadata.submitterInfo.actAs) !==
      JSON.stringify([approval.payerParty]) ||
    metadata.synchronizerId !== approval.synchronizerId ||
    metadata.inputContracts.length !== 0 ||
    metadata.globalKeyMapping.length !== 0
  ) {
    throw new Error(
      "reference wallet prepared approval metadata does not match",
    );
  }
  const preparationTime = metadata.preparationTime;
  const maxRecordTime = metadata.maxRecordTime;
  if (maxRecordTime === undefined) {
    throw new Error("reference wallet prepared record-time metadata is absent");
  }
  const createdAt = BigInt(Date.parse(request.createdAt)) * 1_000n;
  const now = BigInt(Date.now()) * 1_000n;
  if (
    !Number.isInteger(metadata.mediatorGroup) ||
    metadata.mediatorGroup < 0 ||
    metadata.mediatorGroup > 4_294_967_295 ||
    !UUID.test(metadata.transactionUuid) ||
    preparationTime < createdAt - CLOCK_TOLERANCE_MICROS ||
    preparationTime > now + CLOCK_TOLERANCE_MICROS ||
    maxRecordTime <= preparationTime ||
    maxRecordTime - preparationTime > MAX_RECORD_WINDOW_MICROS ||
    maxRecordTime <= now
  ) {
    throw new Error(
      "reference wallet prepared record-time metadata is invalid",
    );
  }
  const minimum = metadata.minLedgerEffectiveTime;
  const maximum = metadata.maxLedgerEffectiveTime;
  if (
    (minimum === undefined) !== (maximum === undefined) ||
    (minimum !== undefined &&
      maximum !== undefined &&
      (minimum > preparationTime ||
        maximum < preparationTime ||
        minimum > maximum ||
        maximum >= maxRecordTime))
  ) {
    throw new Error(
      "reference wallet prepared ledger-time metadata is invalid",
    );
  }
}
