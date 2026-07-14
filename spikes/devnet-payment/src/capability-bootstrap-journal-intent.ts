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

const OPERATION_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type IntentRecord = Readonly<{
  kind: "intent";
  operationId: `sha256:${string}`;
  payload: PersistedBootstrapIntentV1;
  payloadSha256: `sha256:${string}`;
  schema: "sotto-capability-bootstrap-journal-v1";
}>;

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("bootstrap intent record must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = ["kind", "operationId", "payload", "payloadSha256", "schema"];
  if (
    JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify(keys.sort()) ||
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
