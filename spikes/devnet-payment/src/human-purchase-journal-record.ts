import {
  exactHumanJournalObject as exactObject,
  humanJournalHash as hash,
  humanJournalKind as kind,
  humanJournalRecordDigest as digest,
  humanJournalTimestamp as timestamp,
} from "./human-purchase-journal-primitives.js";
import {
  HUMAN_PURCHASE_JOURNAL_SCHEMA,
  type HumanPurchaseJournalHash,
  type HumanPurchaseJournalPayload,
  type HumanPurchaseJournalRecord,
  type HumanPurchaseJournalStage,
  type HumanPurchaseOperationId,
} from "./human-purchase-journal-types.js";

export function createHumanPurchaseJournalRecord(input: {
  kind: HumanPurchaseJournalStage;
  operationId: HumanPurchaseOperationId;
  payload: HumanPurchaseJournalPayload;
  previousRecordSha256: HumanPurchaseJournalHash | null;
  recordedAt?: string;
}): HumanPurchaseJournalRecord {
  const unsigned = Object.freeze({
    kind: input.kind,
    operationId: input.operationId,
    payload: input.payload,
    previousRecordSha256: input.previousRecordSha256,
    recordedAt: timestamp(input.recordedAt ?? new Date().toISOString()),
    schema: HUMAN_PURCHASE_JOURNAL_SCHEMA,
  });
  return Object.freeze({ ...unsigned, recordSha256: digest(unsigned) });
}

export function parseHumanPurchaseJournalRecord(
  value: unknown,
  expected: Readonly<{
    kind: HumanPurchaseJournalStage;
    operationId: HumanPurchaseOperationId;
    previousRecordSha256: HumanPurchaseJournalHash | null;
  }>,
  parsePayload: (value: unknown) => HumanPurchaseJournalPayload,
): HumanPurchaseJournalRecord {
  const source = exactObject(
    value,
    [
      "kind",
      "operationId",
      "payload",
      "previousRecordSha256",
      "recordedAt",
      "recordSha256",
      "schema",
    ],
    `human purchase ${expected.kind} record`,
  );
  const actualKind = kind(source.kind);
  const operationId = hash(
    source.operationId,
    "human purchase journal operation ID",
  ) as HumanPurchaseOperationId;
  const previous =
    source.previousRecordSha256 === null
      ? null
      : hash(source.previousRecordSha256, "human purchase previous record");
  if (
    source.schema !== HUMAN_PURCHASE_JOURNAL_SCHEMA ||
    actualKind !== expected.kind ||
    operationId !== expected.operationId ||
    previous !== expected.previousRecordSha256
  ) {
    throw new Error(`human purchase ${expected.kind} record chain is invalid`);
  }
  const parsed = createHumanPurchaseJournalRecord({
    kind: actualKind,
    operationId,
    payload: parsePayload(source.payload),
    previousRecordSha256: previous,
    recordedAt: timestamp(source.recordedAt),
  });
  if (
    hash(source.recordSha256, "human purchase journal record digest") !==
    parsed.recordSha256
  ) {
    throw new Error(`human purchase ${expected.kind} integrity check failed`);
  }
  return parsed;
}
