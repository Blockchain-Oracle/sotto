const OPERATION_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UPDATE_PATTERN = /^1220[0-9a-f]{64}$/u;

export type CapabilityBootstrapResolution = Readonly<{
  commandId: string;
  contractId: string;
  offset: number | null;
  outcome: "submitted" | "reconciled-after-ambiguous" | "recovered";
  updateId: string | null;
}>;

type ResolutionRecord = CapabilityBootstrapResolution &
  Readonly<{
    kind: "resolved";
    operationId: string;
    previousRecordSha256: string;
    recordedAt: string;
    schema: "sotto-capability-bootstrap-journal-v1";
  }>;

function exactObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("bootstrap resolution record must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "commandId",
    "contractId",
    "kind",
    "offset",
    "operationId",
    "outcome",
    "previousRecordSha256",
    "recordedAt",
    "schema",
    "updateId",
  ];
  if (
    JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(keys.sort())
  ) {
    throw new Error("bootstrap resolution record keys are invalid");
  }
  return record;
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value.trim() === value &&
    new TextEncoder().encode(value).byteLength <= 512
  );
}

function validTimestamp(value: unknown): value is string {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value
  );
}

export function parseCapabilityBootstrapResolution(
  value: unknown,
  expected: Readonly<{
    commandId: string;
    allowLegacyNull?: boolean;
    operationId: string;
    previousRecordSha256: string;
  }>,
): ResolutionRecord {
  const record = exactObject(value);
  const outcome = record.outcome;
  const completionBacked =
    Number.isSafeInteger(record.offset) &&
    (record.offset as number) >= 0 &&
    typeof record.updateId === "string" &&
    UPDATE_PATTERN.test(record.updateId);
  const legacyNull =
    expected.allowLegacyNull === true &&
    outcome !== "submitted" &&
    record.offset === null &&
    record.updateId === null;
  if (
    record.kind !== "resolved" ||
    record.schema !== "sotto-capability-bootstrap-journal-v1" ||
    record.operationId !== expected.operationId ||
    !OPERATION_PATTERN.test(expected.operationId) ||
    record.previousRecordSha256 !== expected.previousRecordSha256 ||
    record.commandId !== expected.commandId ||
    !validIdentifier(record.commandId) ||
    !validIdentifier(record.contractId) ||
    !validTimestamp(record.recordedAt) ||
    !["submitted", "reconciled-after-ambiguous", "recovered"].includes(
      String(outcome),
    ) ||
    (!completionBacked && !legacyNull)
  ) {
    throw new Error("bootstrap resolution record chain is invalid");
  }
  return Object.freeze(record as ResolutionRecord);
}
