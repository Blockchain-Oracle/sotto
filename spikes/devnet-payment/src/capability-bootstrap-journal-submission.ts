import { loadCapabilityBootstrapCompletionCursor } from "./capability-bootstrap-journal-cursor.js";
import { loadCapabilityBootstrapJournalIntent } from "./capability-bootstrap-journal-intent.js";
import {
  exactCapabilityBootstrapJournalObject as exactObject,
  isMissingCapabilityBootstrapJournalRecord as isMissing,
} from "./capability-bootstrap-journal-primitives.js";
import {
  prepareCapabilityBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import { loadCapabilityBootstrapWalletJournal } from "./capability-bootstrap-journal-wallet.js";

export type CapabilityBootstrapSubmissionRecord = Readonly<{
  kind: "submission-started";
  operationId: string;
  previousRecordSha256: string;
  recordedAt: string;
  schema: "sotto-capability-bootstrap-journal-v1";
}>;

function parseSubmissionRecord(
  value: unknown,
  operationId: string,
  previousRecordSha256: string,
): CapabilityBootstrapSubmissionRecord {
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
  return record as CapabilityBootstrapSubmissionRecord;
}

export async function loadCapabilityBootstrapSubmissionRecord(
  directory: string,
  operationId: string,
  previousRecordSha256: string,
): Promise<CapabilityBootstrapSubmissionRecord | null> {
  try {
    return parseSubmissionRecord(
      await readCapabilityBootstrapJournalJson(
        directory,
        "10-submission-started.json",
      ),
      operationId,
      previousRecordSha256,
    );
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
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
  const cursor = await loadCapabilityBootstrapCompletionCursor(directory, {
    operationId: loaded.operationId,
    previousRecordSha256: loaded.recordSha256,
  });
  if (cursor === null)
    throw new Error("bootstrap completion cursor is required");
  const wallet = await loadCapabilityBootstrapWalletJournal(
    directory,
    loaded.operationId,
    cursor.recordSha256,
  );
  if (wallet.preparedVerified !== null) {
    throw new Error("bootstrap wallet execution mode already exists");
  }
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    "10-submission-started.json",
    {
      kind: "submission-started",
      operationId: loaded.operationId,
      previousRecordSha256: cursor.recordSha256,
      recordedAt: new Date().toISOString(),
      schema: "sotto-capability-bootstrap-journal-v1",
    },
  );
}
