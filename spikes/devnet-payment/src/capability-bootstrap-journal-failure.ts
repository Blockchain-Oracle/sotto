import {
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import { isGoogleRpcStatusCode } from "./canton-status-code.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export type CapabilityBootstrapFailure = Readonly<{
  commandId: string;
  completionOffset: number;
  outcome: "rejected";
  statusCode: number;
}>;

type FailureRecord = CapabilityBootstrapFailure &
  Readonly<{
    kind: "failed";
    operationId: string;
    previousRecordSha256: string;
    recordedAt: string;
    schema: "sotto-capability-bootstrap-journal-v1";
  }>;

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

function parseFailureRecord(
  value: unknown,
  expected: Readonly<{
    commandId: string;
    operationId: string;
    previousRecordSha256: string;
  }>,
): FailureRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("bootstrap failure record must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "commandId",
    "completionOffset",
    "kind",
    "operationId",
    "outcome",
    "previousRecordSha256",
    "recordedAt",
    "schema",
    "statusCode",
  ];
  if (
    JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify(keys.sort()) ||
    record.kind !== "failed" ||
    record.schema !== "sotto-capability-bootstrap-journal-v1" ||
    record.operationId !== expected.operationId ||
    !SHA256_PATTERN.test(expected.operationId) ||
    record.previousRecordSha256 !== expected.previousRecordSha256 ||
    !SHA256_PATTERN.test(expected.previousRecordSha256) ||
    record.commandId !== expected.commandId ||
    !validIdentifier(record.commandId) ||
    record.outcome !== "rejected" ||
    !Number.isSafeInteger(record.completionOffset) ||
    (record.completionOffset as number) < 0 ||
    !isGoogleRpcStatusCode(record.statusCode) ||
    record.statusCode === 0 ||
    !validTimestamp(record.recordedAt)
  ) {
    throw new Error("bootstrap failure record chain is invalid");
  }
  return Object.freeze(record as FailureRecord);
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function loadCapabilityBootstrapFailure(
  directory: string,
  expected: Readonly<{
    commandId: string;
    operationId: string;
    previousRecordSha256: string;
  }>,
): Promise<CapabilityBootstrapFailure | null> {
  try {
    const record = parseFailureRecord(
      await readCapabilityBootstrapJournalJson(directory, "30-failed.json"),
      expected,
    );
    return Object.freeze({
      commandId: record.commandId,
      completionOffset: record.completionOffset,
      outcome: record.outcome,
      statusCode: record.statusCode,
    });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function writeCapabilityBootstrapFailure(
  directory: string,
  input: Readonly<{
    commandId: string;
    completionOffset: number;
    operationId: string;
    previousRecordSha256: string;
    statusCode: number;
  }>,
): Promise<void> {
  const record = {
    commandId: input.commandId,
    completionOffset: input.completionOffset,
    kind: "failed",
    operationId: input.operationId,
    outcome: "rejected",
    previousRecordSha256: input.previousRecordSha256,
    recordedAt: new Date().toISOString(),
    schema: "sotto-capability-bootstrap-journal-v1",
    statusCode: input.statusCode,
  } as const;
  parseFailureRecord(record, input);
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "30-failed.json",
    record,
  );
}
