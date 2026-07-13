import { createHash } from "node:crypto";
import {
  exportFiveNorthPreapprovalIntent,
  restoreFiveNorthPreapprovalIntent,
  type PersistedFiveNorthPreapprovalIntentV1,
} from "./five-north-preapproval-intent.js";
import type { FiveNorthPreapprovalProposalRequest } from "./five-north-preapproval-proposal.js";
import { withOwnerOnlyBootstrapLease } from "./capability-bootstrap-lease.js";
import {
  prepareOwnerOnlyBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";

const DIRECTORY_NAME = "devnet-transfer-preapproval-bootstrap";
const JOURNAL_SCHEMA = "sotto-transfer-preapproval-journal-v1";
const LEASE_SCHEMA = "sotto-transfer-preapproval-bootstrap-lease-v1";
const OPERATION_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type IntentRecord = Readonly<{
  kind: "intent";
  operationId: `sha256:${string}`;
  payload: PersistedFiveNorthPreapprovalIntentV1;
  payloadSha256: `sha256:${string}`;
  schema: typeof JOURNAL_SCHEMA;
}>;

type SubmissionRecord = Readonly<{
  kind: "submission-started";
  operationId: string;
  previousRecordSha256: string;
  recordedAt: string;
  schema: typeof JOURNAL_SCHEMA;
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

function intentRecord(
  payload: PersistedFiveNorthPreapprovalIntentV1,
): IntentRecord {
  const source = JSON.stringify(payload);
  return Object.freeze({
    kind: "intent" as const,
    operationId: sha256(`sotto-transfer-preapproval-operation-v1\0${source}`),
    payload,
    payloadSha256: sha256(source),
    schema: JOURNAL_SCHEMA,
  });
}

function parseIntentRecord(value: unknown): IntentRecord {
  const record = exactObject(
    value,
    ["kind", "operationId", "payload", "payloadSha256", "schema"],
    "preapproval intent record",
  );
  if (
    record.kind !== "intent" ||
    record.schema !== JOURNAL_SCHEMA ||
    typeof record.operationId !== "string" ||
    !OPERATION_PATTERN.test(record.operationId) ||
    typeof record.payloadSha256 !== "string"
  ) {
    throw new Error("preapproval intent record metadata is invalid");
  }
  const parsed = intentRecord(
    record.payload as PersistedFiveNorthPreapprovalIntentV1,
  );
  if (
    parsed.operationId !== record.operationId ||
    parsed.payloadSha256 !== record.payloadSha256
  ) {
    throw new Error("preapproval intent record integrity check failed");
  }
  restoreFiveNorthPreapprovalIntent(record.payload);
  return parsed;
}

function parseSubmissionRecord(
  value: unknown,
  operationId: string,
  previousRecordSha256: string,
): SubmissionRecord {
  const record = exactObject(
    value,
    ["kind", "operationId", "previousRecordSha256", "recordedAt", "schema"],
    "preapproval submission record",
  );
  const timestamp =
    typeof record.recordedAt === "string" ? Date.parse(record.recordedAt) : NaN;
  if (
    record.kind !== "submission-started" ||
    record.schema !== JOURNAL_SCHEMA ||
    record.operationId !== operationId ||
    record.previousRecordSha256 !== previousRecordSha256 ||
    typeof record.recordedAt !== "string" ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== record.recordedAt
  ) {
    throw new Error("preapproval submission record chain is invalid");
  }
  return record as SubmissionRecord;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function directory(workspaceRoot: string): Promise<string> {
  return prepareOwnerOnlyBootstrapJournalDirectory(
    workspaceRoot,
    DIRECTORY_NAME,
  );
}

export async function initializeFiveNorthPreapprovalJournal(input: {
  request: FiveNorthPreapprovalProposalRequest;
  sourceCommit: string;
  workspaceRoot: string;
}) {
  const target = await directory(input.workspaceRoot);
  const record = intentRecord(
    exportFiveNorthPreapprovalIntent(input.request, input.sourceCommit),
  );
  await writeExclusiveCapabilityBootstrapJson(target, "00-intent.json", record);
  return Object.freeze({ operationId: record.operationId });
}

export async function loadFiveNorthPreapprovalJournalIntent(
  workspaceRoot: string,
) {
  const target = await directory(workspaceRoot);
  const record = parseIntentRecord(
    await readCapabilityBootstrapJournalJson(target, "00-intent.json"),
  );
  return Object.freeze({
    intent: record.payload,
    operationId: record.operationId,
    recordSha256: sha256(JSON.stringify(record)),
  });
}

export async function markFiveNorthPreapprovalSubmissionStarted(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<void> {
  const target = await directory(input.workspaceRoot);
  const loaded = await loadFiveNorthPreapprovalJournalIntent(
    input.workspaceRoot,
  );
  if (loaded.operationId !== input.operationId) {
    throw new Error("preapproval operation ID does not match the journal");
  }
  await writeExclusiveCapabilityBootstrapJson(
    target,
    "10-submission-started.json",
    {
      kind: "submission-started",
      operationId: loaded.operationId,
      previousRecordSha256: loaded.recordSha256,
      recordedAt: new Date().toISOString(),
      schema: JOURNAL_SCHEMA,
    },
  );
}

export async function loadFiveNorthPreapprovalJournalState(
  workspaceRoot: string,
) {
  const target = await directory(workspaceRoot);
  const loaded = await loadFiveNorthPreapprovalJournalIntent(workspaceRoot);
  let submission: SubmissionRecord | undefined;
  try {
    submission = parseSubmissionRecord(
      await readCapabilityBootstrapJournalJson(
        target,
        "10-submission-started.json",
      ),
      loaded.operationId,
      loaded.recordSha256,
    );
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return Object.freeze({
    ...loaded,
    submissionStarted: submission !== undefined,
  });
}

export function withFiveNorthPreapprovalLease<T>(input: {
  action: (assertOwned: () => Promise<void>) => Promise<T>;
  operationId: string;
  workspaceRoot: string;
}): Promise<T> {
  return withOwnerOnlyBootstrapLease({
    ...input,
    directoryName: DIRECTORY_NAME,
    leaseSchema: LEASE_SCHEMA,
  });
}
