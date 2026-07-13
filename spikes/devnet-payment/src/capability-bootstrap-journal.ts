import { createHash } from "node:crypto";
import {
  exportBoundedCapabilityBootstrapIntent,
  restoreBoundedCapabilityBootstrapIntent,
  type BoundedCapabilityBootstrapRequest,
  type PersistedBootstrapIntentV1,
} from "@sotto/x402-canton";
import {
  prepareCapabilityBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import {
  parseCapabilityBootstrapResolution,
  type CapabilityBootstrapResolution,
} from "./capability-bootstrap-journal-resolution.js";
export { withCapabilityBootstrapLease } from "./capability-bootstrap-lease.js";

const OPERATION_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type IntentRecord = Readonly<{
  kind: "intent";
  operationId: `sha256:${string}`;
  payload: PersistedBootstrapIntentV1;
  payloadSha256: `sha256:${string}`;
  schema: "sotto-capability-bootstrap-journal-v1";
}>;

type SubmissionRecord = Readonly<{
  kind: "submission-started";
  operationId: string;
  previousRecordSha256: string;
  recordedAt: string;
  schema: "sotto-capability-bootstrap-journal-v1";
}>;

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
  return record;
}

function intentRecord(payload: PersistedBootstrapIntentV1): IntentRecord {
  const source = JSON.stringify(payload);
  return Object.freeze({
    kind: "intent" as const,
    operationId: sha256(`sotto-bootstrap-operation-v1\0${source}`),
    payload,
    payloadSha256: sha256(source),
    schema: "sotto-capability-bootstrap-journal-v1" as const,
  });
}

function parseIntentRecord(value: unknown): IntentRecord {
  const record = exactObject(
    value,
    ["kind", "operationId", "payload", "payloadSha256", "schema"],
    "bootstrap intent record",
  );
  if (
    record.kind !== "intent" ||
    record.schema !== "sotto-capability-bootstrap-journal-v1" ||
    typeof record.operationId !== "string" ||
    !OPERATION_PATTERN.test(record.operationId) ||
    typeof record.payloadSha256 !== "string"
  ) {
    throw new Error("bootstrap intent record metadata is invalid");
  }
  const parsed = intentRecord(record.payload as PersistedBootstrapIntentV1);
  if (
    parsed.operationId !== record.operationId ||
    parsed.payloadSha256 !== record.payloadSha256
  ) {
    throw new Error("bootstrap intent record integrity check failed");
  }
  restoreBoundedCapabilityBootstrapIntent(record.payload);
  return parsed;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseSubmissionRecord(
  value: unknown,
  operationId: string,
  previousRecordSha256: string,
): SubmissionRecord {
  const record = exactObject(
    value,
    ["kind", "operationId", "previousRecordSha256", "recordedAt", "schema"],
    "bootstrap submission record",
  );
  if (
    record.kind !== "submission-started" ||
    record.schema !== "sotto-capability-bootstrap-journal-v1" ||
    record.operationId !== operationId ||
    record.previousRecordSha256 !== previousRecordSha256 ||
    typeof record.recordedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record.recordedAt) ||
    new Date(Date.parse(record.recordedAt)).toISOString() !== record.recordedAt
  ) {
    throw new Error("bootstrap submission record chain is invalid");
  }
  return record as SubmissionRecord;
}

export async function initializeCapabilityBootstrapJournal(input: {
  request: BoundedCapabilityBootstrapRequest;
  sourceCommit: string;
  workspaceRoot: string;
}) {
  const directory = await prepareCapabilityBootstrapJournalDirectory(
    input.workspaceRoot,
  );
  const record = intentRecord(
    exportBoundedCapabilityBootstrapIntent(input.request, input.sourceCommit),
  );
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "00-intent.json",
    record,
  );
  return Object.freeze({ operationId: record.operationId });
}

export async function loadCapabilityBootstrapJournalIntent(
  workspaceRoot: string,
) {
  const directory =
    await prepareCapabilityBootstrapJournalDirectory(workspaceRoot);
  const record = parseIntentRecord(
    await readCapabilityBootstrapJournalJson(directory, "00-intent.json"),
  );
  return Object.freeze({
    intent: record.payload,
    operationId: record.operationId,
    recordSha256: sha256(JSON.stringify(record)),
  });
}

export async function markCapabilityBootstrapSubmissionStarted(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<void> {
  const directory = await prepareCapabilityBootstrapJournalDirectory(
    input.workspaceRoot,
  );
  const loaded = await loadCapabilityBootstrapJournalIntent(
    input.workspaceRoot,
  );
  if (loaded.operationId !== input.operationId) {
    throw new Error("bootstrap operation ID does not match the journal");
  }
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "10-submission-started.json",
    {
      kind: "submission-started",
      operationId: loaded.operationId,
      previousRecordSha256: loaded.recordSha256,
      recordedAt: new Date().toISOString(),
      schema: "sotto-capability-bootstrap-journal-v1",
    },
  );
}

export async function loadCapabilityBootstrapJournalState(
  workspaceRoot: string,
) {
  const directory =
    await prepareCapabilityBootstrapJournalDirectory(workspaceRoot);
  const loaded = await loadCapabilityBootstrapJournalIntent(workspaceRoot);
  let submission: SubmissionRecord | undefined;
  try {
    submission = parseSubmissionRecord(
      await readCapabilityBootstrapJournalJson(
        directory,
        "10-submission-started.json",
      ),
      loaded.operationId,
      loaded.recordSha256,
    );
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  let resolution: CapabilityBootstrapResolution | undefined;
  try {
    const resolutionValue = await readCapabilityBootstrapJournalJson(
      directory,
      "30-resolved.json",
    );
    if (submission === undefined) {
      throw new Error("bootstrap resolution exists without submission");
    }
    const request = restoreBoundedCapabilityBootstrapIntent(loaded.intent);
    const parsed = parseCapabilityBootstrapResolution(resolutionValue, {
      commandId: request.commandId,
      operationId: loaded.operationId,
      previousRecordSha256: sha256(JSON.stringify(submission)),
    });
    resolution = Object.freeze({
      commandId: parsed.commandId,
      contractId: parsed.contractId,
      offset: parsed.offset,
      outcome: parsed.outcome,
      updateId: parsed.updateId,
    });
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return Object.freeze({
    ...loaded,
    resolution: resolution ?? null,
    submissionStarted: submission !== undefined,
    submissionRecordSha256:
      submission === undefined ? null : sha256(JSON.stringify(submission)),
  });
}

export async function markCapabilityBootstrapResolved(input: {
  commandId: string;
  contractId: string;
  offset: number | null;
  operationId: string;
  outcome: "submitted" | "reconciled-after-ambiguous" | "recovered";
  updateId: string | null;
  workspaceRoot: string;
}): Promise<void> {
  const directory = await prepareCapabilityBootstrapJournalDirectory(
    input.workspaceRoot,
  );
  const state = await loadCapabilityBootstrapJournalState(input.workspaceRoot);
  if (
    state.operationId !== input.operationId ||
    !state.submissionStarted ||
    state.submissionRecordSha256 === null
  ) {
    throw new Error("bootstrap cannot resolve before submission is durable");
  }
  for (const value of [input.commandId, input.contractId, input.outcome]) {
    if (
      value === "" ||
      value.trim() !== value ||
      new TextEncoder().encode(value).byteLength > 512
    ) {
      throw new Error("bootstrap resolution identifier is invalid");
    }
  }
  const record = {
    commandId: input.commandId,
    contractId: input.contractId,
    kind: "resolved",
    offset: input.offset,
    operationId: state.operationId,
    outcome: input.outcome,
    previousRecordSha256: state.submissionRecordSha256,
    recordedAt: new Date().toISOString(),
    schema: "sotto-capability-bootstrap-journal-v1",
    updateId: input.updateId,
  } as const;
  parseCapabilityBootstrapResolution(record, {
    commandId: input.commandId,
    operationId: state.operationId,
    previousRecordSha256: state.submissionRecordSha256,
  });
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "30-resolved.json",
    record,
  );
}
