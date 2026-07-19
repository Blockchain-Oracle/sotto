import {
  prepareCapabilityBootstrapJournalDirectory,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import { writeCapabilityBootstrapCompletionCursor } from "./capability-bootstrap-journal-cursor.js";
import { writeCapabilityBootstrapFailure } from "./capability-bootstrap-journal-failure.js";
import { parseCapabilityBootstrapResolution } from "./capability-bootstrap-journal-resolution.js";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
  restoreCapabilityBootstrapJournalIntent,
} from "./capability-bootstrap-journal-intent.js";
import { markCapabilityBootstrapSubmissionStarted } from "./capability-bootstrap-journal-submission.js";
import {
  markCapabilityBootstrapApprovalRequested,
  markCapabilityBootstrapExecutionStarted,
  markCapabilityBootstrapPreparedVerified,
  markCapabilityBootstrapSignatureReceived,
} from "./capability-bootstrap-journal-wallet.js";
import { loadCapabilityBootstrapJournalState } from "./capability-bootstrap-journal-state.js";
export {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
  loadCapabilityBootstrapJournalState,
};
export {
  markCapabilityBootstrapApprovalRequested,
  markCapabilityBootstrapExecutionStarted,
  markCapabilityBootstrapPreparedVerified,
  markCapabilityBootstrapSignatureReceived,
  markCapabilityBootstrapSubmissionStarted,
};
export { withCapabilityBootstrapLease } from "./capability-bootstrap-lease.js";

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
    !state.executionStarted ||
    state.executionRecordSha256 === null ||
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
    previousRecordSha256: state.executionRecordSha256,
    recordedAt: new Date().toISOString(),
    schema: "sotto-capability-bootstrap-journal-v1",
    updateId: input.updateId,
  } as const;
  parseCapabilityBootstrapResolution(record, {
    commandId: input.commandId,
    operationId: state.operationId,
    previousRecordSha256: state.executionRecordSha256,
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
  const request = restoreCapabilityBootstrapJournalIntent(state.intent);
  if (
    state.operationId !== input.operationId ||
    !state.executionStarted ||
    state.executionRecordSha256 === null ||
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
    previousRecordSha256: state.executionRecordSha256,
    statusCode: input.statusCode,
  });
}
