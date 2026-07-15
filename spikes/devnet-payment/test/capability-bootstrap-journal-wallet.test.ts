import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapApprovalRequested,
  markCapabilityBootstrapCompletionCursor,
  markCapabilityBootstrapExecutionStarted,
  markCapabilityBootstrapPreparedVerified,
  markCapabilityBootstrapResolved,
  markCapabilityBootstrapSignatureReceived,
  markCapabilityBootstrapSubmissionStarted,
} from "../src/capability-bootstrap-journal.js";
import { bootstrapRequest } from "./capability-bootstrap-completion.fixtures.js";

const preparedTransactionHash = `sha256:${"a".repeat(64)}` as const;
const sessionId = `sha256:${"b".repeat(64)}` as const;
const signatureSha256 = `sha256:${"c".repeat(64)}` as const;
const signedBy = `1220${"d".repeat(64)}`;
const updateId = `1220${"e".repeat(64)}`;

describe("wallet capability bootstrap journal", () => {
  let workspaceRoot: string;
  const directory = () =>
    join(workspaceRoot, "tmp", "devnet-capability-bootstrap");

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-wallet-journal-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  async function initialize() {
    const initialized = await initializeCapabilityBootstrapJournal({
      request: bootstrapRequest(),
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });
    await markCapabilityBootstrapCompletionCursor({
      beginExclusive: 41,
      operationId: initialized.operationId,
      workspaceRoot,
    });
    return initialized.operationId;
  }

  async function writeWalletSequence(operationId: string) {
    await markCapabilityBootstrapPreparedVerified({
      operationId,
      preparedTransactionHash,
      workspaceRoot,
    });
    await markCapabilityBootstrapApprovalRequested({
      connectorId: "wallet-sdk-reference",
      connectorKind: "wallet-sdk",
      operationId,
      sessionId,
      workspaceRoot,
    });
    await markCapabilityBootstrapSignatureReceived({
      operationId,
      sessionId,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signatureSha256,
      signedBy,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      workspaceRoot,
    });
    await markCapabilityBootstrapExecutionStarted({
      operationId,
      sessionId,
      submissionId: "2b72142a-7343-4ad7-8db6-7dc74f514029",
      userId: "ledger-user-6",
      workspaceRoot,
    });
  }

  it("persists the exact redacted wallet execution chain", async () => {
    const operationId = await initialize();
    await writeWalletSequence(operationId);

    const state = await loadCapabilityBootstrapJournalState(workspaceRoot);
    expect(state).toMatchObject({
      executionMode: "wallet",
      executionStarted: true,
      operationId,
      submissionStarted: false,
      wallet: {
        approvalRequested: { connectorKind: "wallet-sdk", sessionId },
        executionStarted: {
          submissionId: "2b72142a-7343-4ad7-8db6-7dc74f514029",
          userId: "ledger-user-6",
        },
        preparedVerified: { preparedTransactionHash },
        signatureReceived: { signatureSha256, signedBy },
      },
    });
    const sources = await Promise.all(
      [
        "10-prepared-verified.json",
        "11-approval-requested.json",
        "12-signature-received.json",
        "13-execution-started.json",
      ].map((name) => readFile(join(directory(), name), "utf8")),
    );
    expect(sources.join("\n")).not.toMatch(
      /"preparedTransaction"|private|Bearer|signatureBytes|approvalSummary/iu,
    );

    await markCapabilityBootstrapResolved({
      commandId: bootstrapRequest().commandId,
      contractId: "00wallet-capability",
      offset: 52,
      operationId,
      outcome: "submitted",
      updateId,
      workspaceRoot,
    });
    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      executionMode: "wallet",
      resolution: {
        contractId: "00wallet-capability",
        offset: 52,
        updateId,
      },
    });
  });

  it("enforces stage order and forbids mixing direct submission", async () => {
    const operationId = await initialize();
    await expect(
      markCapabilityBootstrapApprovalRequested({
        connectorId: "wallet-sdk-reference",
        connectorKind: "wallet-sdk",
        operationId,
        sessionId,
        workspaceRoot,
      }),
    ).rejects.toThrow(/prepared/iu);
    await markCapabilityBootstrapPreparedVerified({
      operationId,
      preparedTransactionHash,
      workspaceRoot,
    });
    await expect(
      markCapabilityBootstrapSubmissionStarted({ operationId, workspaceRoot }),
    ).rejects.toThrow(/wallet|mode/iu);
  });

  it("keeps direct-submit journals readable and distinctly labeled", async () => {
    const operationId = await initialize();
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      executionMode: "direct",
      executionStarted: true,
      submissionStarted: true,
      wallet: null,
    });
    await expect(
      markCapabilityBootstrapPreparedVerified({
        operationId,
        preparedTransactionHash,
        workspaceRoot,
      }),
    ).rejects.toThrow(/direct|mode/iu);
  });
});
