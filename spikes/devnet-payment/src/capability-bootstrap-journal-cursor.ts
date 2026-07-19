import { createHash } from "node:crypto";
import {
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type CompletionCursorRecord = Readonly<{
  beginExclusive: number;
  kind: "completion-cursor";
  operationId: string;
  previousRecordSha256: string;
  recordedAt: string;
  schema: "sotto-capability-bootstrap-journal-v1";
}>;

function recordSha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseTimestamp(value: unknown): boolean {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value
  );
}

function parseCompletionCursorRecord(
  value: unknown,
  expected: Readonly<{
    operationId: string;
    previousRecordSha256: string;
  }>,
): CompletionCursorRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("bootstrap completion cursor must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "beginExclusive",
    "kind",
    "operationId",
    "previousRecordSha256",
    "recordedAt",
    "schema",
  ];
  if (
    JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify(keys.sort()) ||
    record.kind !== "completion-cursor" ||
    record.schema !== "sotto-capability-bootstrap-journal-v1" ||
    record.operationId !== expected.operationId ||
    !SHA256_PATTERN.test(expected.operationId) ||
    record.previousRecordSha256 !== expected.previousRecordSha256 ||
    !SHA256_PATTERN.test(expected.previousRecordSha256) ||
    !Number.isSafeInteger(record.beginExclusive) ||
    (record.beginExclusive as number) < 0 ||
    !parseTimestamp(record.recordedAt)
  ) {
    throw new Error("bootstrap completion cursor chain is invalid");
  }
  return Object.freeze(record as CompletionCursorRecord);
}

export async function loadCapabilityBootstrapCompletionCursor(
  directory: string,
  expected: Readonly<{
    operationId: string;
    previousRecordSha256: string;
  }>,
) {
  try {
    const record = parseCompletionCursorRecord(
      await readCapabilityBootstrapJournalJson(
        directory,
        "05-completion-cursor.json",
      ),
      expected,
    );
    return Object.freeze({ record, recordSha256: recordSha256(record) });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function writeCapabilityBootstrapCompletionCursor(
  directory: string,
  input: Readonly<{
    beginExclusive: number;
    operationId: string;
    previousRecordSha256: string;
  }>,
): Promise<void> {
  const record = {
    beginExclusive: input.beginExclusive,
    kind: "completion-cursor",
    operationId: input.operationId,
    previousRecordSha256: input.previousRecordSha256,
    recordedAt: new Date().toISOString(),
    schema: "sotto-capability-bootstrap-journal-v1",
  } as const;
  parseCompletionCursorRecord(record, input);
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "05-completion-cursor.json",
    record,
  );
}
