import {
  prepareCapabilityBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
} from "./capability-bootstrap-journal-storage.js";
import { loadCapabilityBootstrapCompletionCursor } from "./capability-bootstrap-journal-cursor.js";
import { loadCapabilityBootstrapFailure } from "./capability-bootstrap-journal-failure.js";
import {
  parseCapabilityBootstrapResolution,
  type CapabilityBootstrapResolution,
} from "./capability-bootstrap-journal-resolution.js";
import {
  capabilityBootstrapJournalSha256 as sha256,
  isMissingCapabilityBootstrapJournalRecord as isMissing,
} from "./capability-bootstrap-journal-primitives.js";
import {
  loadCapabilityBootstrapJournalIntent,
  restoreCapabilityBootstrapJournalIntent,
} from "./capability-bootstrap-journal-intent.js";
import { loadCapabilityBootstrapSubmissionRecord } from "./capability-bootstrap-journal-submission.js";
import { loadCapabilityBootstrapWalletJournal } from "./capability-bootstrap-journal-wallet.js";

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
  const initialPrevious = completionCursor?.recordSha256 ?? loaded.recordSha256;
  const submission = await loadCapabilityBootstrapSubmissionRecord(
    directory,
    loaded.operationId,
    initialPrevious,
  );
  const wallet = await loadCapabilityBootstrapWalletJournal(
    directory,
    loaded.operationId,
    initialPrevious,
  );
  if (submission !== null && wallet.preparedVerified !== null) {
    throw new Error("bootstrap journal execution modes conflict");
  }
  const executionMode =
    submission !== null
      ? ("direct" as const)
      : wallet.preparedVerified !== null
        ? ("wallet" as const)
        : null;
  const executionRecord = submission ?? wallet.executionStarted;
  let resolution: CapabilityBootstrapResolution | undefined;
  let failure = null;
  const request = restoreCapabilityBootstrapJournalIntent(loaded.intent);
  const terminalExpected =
    executionRecord === null
      ? null
      : {
          commandId: request.commandId,
          operationId: loaded.operationId,
          previousRecordSha256: sha256(JSON.stringify(executionRecord)),
        };
  try {
    const value = await readCapabilityBootstrapJournalJson(
      directory,
      "30-resolved.json",
    );
    if (executionRecord === null) {
      throw new Error("bootstrap resolution exists without execution");
    }
    const parsed = parseCapabilityBootstrapResolution(value, {
      allowLegacyNull: completionCursor === null,
      commandId: request.commandId,
      operationId: loaded.operationId,
      previousRecordSha256: sha256(JSON.stringify(executionRecord)),
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
      throw new Error(
        "bootstrap failure exists without submission or wallet execution",
      );
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
    executionMode,
    executionRecordSha256:
      executionRecord === null ? null : sha256(JSON.stringify(executionRecord)),
    executionStarted: executionRecord !== null,
    failure,
    resolution: resolution ?? null,
    submissionStarted: submission !== null,
    submissionRecordSha256:
      submission === null ? null : sha256(JSON.stringify(submission)),
    wallet: executionMode === "wallet" ? wallet : null,
  });
}
