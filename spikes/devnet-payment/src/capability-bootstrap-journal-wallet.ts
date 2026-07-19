import type { CapabilityWalletConnectorKind } from "@sotto/x402-canton";
import { loadCapabilityBootstrapCompletionCursor } from "./capability-bootstrap-journal-cursor.js";
import { loadCapabilityBootstrapJournalIntent } from "./capability-bootstrap-journal-intent.js";
import { capabilityBootstrapJournalSha256 as sha256 } from "./capability-bootstrap-journal-primitives.js";
import {
  prepareCapabilityBootstrapJournalDirectory,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import {
  CAPABILITY_BOOTSTRAP_WALLET_SCHEMA,
  CAPABILITY_BOOTSTRAP_WALLET_STAGES,
  loadCapabilityBootstrapWalletJournal,
  parseCapabilityBootstrapWalletRecord,
  readOptionalCapabilityBootstrapJournalJson,
} from "./capability-bootstrap-journal-wallet-records.js";

export { loadCapabilityBootstrapWalletJournal };

const PREVIOUS_STAGE_NAMES = [
  "completion cursor",
  "prepared-verified",
  "approval-requested",
  "signature-received",
] as const;

async function appendWalletStage(
  input: Readonly<{ operationId: string; workspaceRoot: string }>,
  index: number,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
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
  if (
    (await readOptionalCapabilityBootstrapJournalJson(
      directory,
      "10-submission-started.json",
    )) !== null
  ) {
    throw new Error("bootstrap direct execution mode already exists");
  }
  const wallet = await loadCapabilityBootstrapWalletJournal(
    directory,
    loaded.operationId,
    cursor.recordSha256,
  );
  const records = [
    wallet.preparedVerified,
    wallet.approvalRequested,
    wallet.signatureReceived,
    wallet.executionStarted,
  ];
  const completed = records.filter((record) => record !== null).length;
  if (completed !== index) {
    throw new Error(
      `bootstrap ${CAPABILITY_BOOTSTRAP_WALLET_STAGES[index]![1]} requires ${PREVIOUS_STAGE_NAMES[index]}`,
    );
  }
  const previous =
    index === 0
      ? cursor.recordSha256
      : sha256(JSON.stringify(records[index - 1]));
  const record = {
    kind: CAPABILITY_BOOTSTRAP_WALLET_STAGES[index]![1],
    operationId: loaded.operationId,
    previousRecordSha256: previous,
    recordedAt: new Date().toISOString(),
    schema: CAPABILITY_BOOTSTRAP_WALLET_SCHEMA,
    ...payload,
  };
  parseCapabilityBootstrapWalletRecord(
    record,
    index,
    loaded.operationId,
    previous,
  );
  await writeExclusiveCapabilityBootstrapJson(
    directory,
    CAPABILITY_BOOTSTRAP_WALLET_STAGES[index]![0],
    record,
  );
}

export const markCapabilityBootstrapPreparedVerified = (
  input: Readonly<{
    operationId: string;
    preparedTransactionHash: `sha256:${string}`;
    workspaceRoot: string;
  }>,
) =>
  appendWalletStage(input, 0, {
    preparedTransactionHash: input.preparedTransactionHash,
  });

export const markCapabilityBootstrapApprovalRequested = (
  input: Readonly<{
    connectorId: string;
    connectorKind: CapabilityWalletConnectorKind;
    operationId: string;
    sessionId: `sha256:${string}`;
    workspaceRoot: string;
  }>,
) =>
  appendWalletStage(input, 1, {
    connectorId: input.connectorId,
    connectorKind: input.connectorKind,
    sessionId: input.sessionId,
  });

export const markCapabilityBootstrapSignatureReceived = (
  input: Readonly<{
    operationId: string;
    sessionId: `sha256:${string}`;
    signatureFormat: string;
    signatureSha256: `sha256:${string}`;
    signedBy: string;
    signingAlgorithm: string;
    workspaceRoot: string;
  }>,
) =>
  appendWalletStage(input, 2, {
    sessionId: input.sessionId,
    signatureFormat: input.signatureFormat,
    signatureSha256: input.signatureSha256,
    signedBy: input.signedBy,
    signingAlgorithm: input.signingAlgorithm,
  });

export const markCapabilityBootstrapExecutionStarted = (
  input: Readonly<{
    operationId: string;
    sessionId: `sha256:${string}`;
    submissionId: string;
    userId: string;
    workspaceRoot: string;
  }>,
) =>
  appendWalletStage(input, 3, {
    sessionId: input.sessionId,
    submissionId: input.submissionId,
    userId: input.userId,
  });
