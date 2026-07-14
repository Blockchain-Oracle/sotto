import { restoreBoundedCapabilityBootstrapIntent } from "@sotto/x402-canton";
import {
  prepareCapabilityBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import {
  loadCapabilityBootstrapCompletionCursor,
  writeCapabilityBootstrapCompletionCursor,
} from "./capability-bootstrap-journal-cursor.js";
import {
  loadCapabilityBootstrapFailure,
  writeCapabilityBootstrapFailure,
} from "./capability-bootstrap-journal-failure.js";
import {
  parseCapabilityBootstrapResolution,
  type CapabilityBootstrapResolution,
} from "./capability-bootstrap-journal-resolution.js";
import {
  capabilityBootstrapJournalSha256 as sha256,
  exactCapabilityBootstrapJournalObject as exactObject,
  isMissingCapabilityBootstrapJournalRecord as isMissing,
} from "./capability-bootstrap-journal-primitives.js";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
} from "./capability-bootstrap-journal-intent.js";
export {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
};
export { withCapabilityBootstrapLease } from "./capability-bootstrap-lease.js";

type SubmissionRecord = Readonly<{
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
  if (cursor === null) {
    throw new Error("bootstrap completion cursor is required");
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

export async function loadCapabilityBootstrapJournalState(
  workspaceRoot: string,
) {
  const directory =
    await prepareCapabilityBootstrapJournalDirectory(workspaceRoot);
  const loaded = await loadCapabilityBootstrapJournalIntent(workspaceRoot);
  const completionCursor = await loadCapabilityBootstrapCompletionCursor(
    directory,
    {
      operationId: loaded.operationId,
      previousRecordSha256: loaded.recordSha256,
    },
  );
  let submission: SubmissionRecord | undefined;
  try {
    submission = parseSubmissionRecord(
      await readCapabilityBootstrapJournalJson(
        directory,
        "10-submission-started.json",
      ),
      loaded.operationId,
      completionCursor?.recordSha256 ?? loaded.recordSha256,
    );
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  let resolution: CapabilityBootstrapResolution | undefined;
  let failure = null;
  const request = restoreBoundedCapabilityBootstrapIntent(loaded.intent);
  const terminalExpected =
    submission === undefined
      ? null
      : {
          commandId: request.commandId,
          operationId: loaded.operationId,
          previousRecordSha256: sha256(JSON.stringify(submission)),
        };
  try {
    const resolutionValue = await readCapabilityBootstrapJournalJson(
      directory,
      "30-resolved.json",
    );
    if (submission === undefined) {
      throw new Error("bootstrap resolution exists without submission");
    }
    const parsed = parseCapabilityBootstrapResolution(resolutionValue, {
      allowLegacyNull: completionCursor === null,
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
  if (terminalExpected !== null) {
    failure = await loadCapabilityBootstrapFailure(directory, terminalExpected);
  } else {
    try {
      await readCapabilityBootstrapJournalJson(directory, "30-failed.json");
      throw new Error("bootstrap failure exists without submission");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  if (resolution !== undefined && failure !== null) {
    throw new Error("bootstrap journal has conflicting terminal records");
  }
  return Object.freeze({
    ...loaded,
    completionCursor: completionCursor?.record.beginExclusive ?? null,
    failure,
    resolution: resolution ?? null,
    submissionStarted: submission !== undefined,
    submissionRecordSha256:
      submission === undefined ? null : sha256(JSON.stringify(submission)),
  });
}

export async function markCapabilityBootstrapCompletionCursor(input: {
  beginExclusive: number;
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
  await writeCapabilityBootstrapCompletionCursor(directory, {
    beginExclusive: input.beginExclusive,
    operationId: loaded.operationId,
    previousRecordSha256: loaded.recordSha256,
  });
}

export async function markCapabilityBootstrapResolved(input: {
  commandId: string;
  contractId: string;
  offset: number;
  operationId: string;
  outcome: "submitted" | "reconciled-after-ambiguous" | "recovered";
  updateId: string;
  workspaceRoot: string;
}): Promise<void> {
  const directory = await prepareCapabilityBootstrapJournalDirectory(
    input.workspaceRoot,
  );
  const state = await loadCapabilityBootstrapJournalState(input.workspaceRoot);
  if (
    state.operationId !== input.operationId ||
    !state.submissionStarted ||
    state.submissionRecordSha256 === null ||
    state.failure !== null
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

export async function markCapabilityBootstrapFailed(input: {
  commandId: string;
  completionOffset: number;
  operationId: string;
  statusCode: number;
  workspaceRoot: string;
}): Promise<void> {
  const directory = await prepareCapabilityBootstrapJournalDirectory(
    input.workspaceRoot,
  );
  const state = await loadCapabilityBootstrapJournalState(input.workspaceRoot);
  const request = restoreBoundedCapabilityBootstrapIntent(state.intent);
  if (
    state.operationId !== input.operationId ||
    !state.submissionStarted ||
    state.submissionRecordSha256 === null ||
    state.resolution !== null ||
    state.failure !== null ||
    request.commandId !== input.commandId
  ) {
    throw new Error("bootstrap cannot fail before submission is durable");
  }
  await writeCapabilityBootstrapFailure(directory, {
    commandId: input.commandId,
    completionOffset: input.completionOffset,
    operationId: state.operationId,
    previousRecordSha256: state.submissionRecordSha256,
    statusCode: input.statusCode,
  });
}
