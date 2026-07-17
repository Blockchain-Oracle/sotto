import {
  chmod,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAuthenticatedHumanSettlementExpectation } from "@sotto/x402-canton";
import { authenticateHumanPurchaseProviderSettlement } from "../src/human-purchase-provider-reconciliation.js";
import {
  initializeHumanPurchaseJournal,
  loadHumanPurchaseJournal,
  markHumanPurchaseApprovalRequested,
  markHumanPurchaseCompletion,
  markHumanPurchaseDelivery,
  markHumanPurchaseExecutionStarted,
  markHumanPurchaseSettlementReconciled,
  markHumanPurchaseSignatureVerified,
  withHumanPurchaseJournalLease,
} from "../src/human-purchase-journal.js";
import { humanSettlementTransaction } from "./human-purchase-provider-reconciliation.fixtures.js";
import {
  HUMAN_JOURNAL_PREPARED_HASH as preparedTransactionHash,
  HUMAN_JOURNAL_SESSION as sessionId,
  HUMAN_JOURNAL_UPDATE_ID as updateId,
  humanJournalSha as sha,
  persistedHumanJournalExpectation as persistedExpectation,
} from "./human-purchase-journal.fixtures.js";

const now = "2026-07-17T08:00:00.000Z";

describe("owner-only human purchase journal", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date(now) });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-human-journal-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  async function initialize() {
    return initializeHumanPurchaseJournal({
      beginExclusive: 41,
      expectation: persistedExpectation(),
      workspaceRoot,
    });
  }

  it("initializes one deterministic owner-only purchase intent", async () => {
    const initialized = await initialize();
    const directory = join(workspaceRoot, "tmp", initialized.directoryName);

    expect(initialized.operationId).toBe(
      sha(
        `sotto-human-purchase-operation-v1\0${persistedExpectation().expectation.purchaseCommitment}`,
      ),
    );
    expect(initialized.directoryName).toMatch(
      /^devnet-human-purchase-[0-9a-f]{49}$/u,
    );
    expect((await stat(directory)).mode & 0o077).toBe(0);
    expect((await stat(join(directory, "00-intent.json"))).mode & 0o077).toBe(
      0,
    );
    const state = await loadHumanPurchaseJournal({
      operationId: initialized.operationId,
      workspaceRoot,
    });
    expect(state.stage).toBe("intent");
    expect(state.beginExclusive).toBe(41);
    expect(readAuthenticatedHumanSettlementExpectation(state.expectation)).toBe(
      state.expectation,
    );
    await expect(initialize()).rejects.toThrow();
  });

  it("persists and restores the exact complete hash-chained lifecycle", async () => {
    const { operationId } = await initialize();
    await markHumanPurchaseApprovalRequested({
      operationId,
      sessionId,
      workspaceRoot,
    });
    await markHumanPurchaseSignatureVerified({
      operationId,
      preparedTransactionHash,
      sessionId,
      workspaceRoot,
    });
    await markHumanPurchaseExecutionStarted({
      operationId,
      sessionId,
      submissionId: "123e4567-e89b-42d3-a456-426614174000",
      userId: "five-north-human-submitter",
      workspaceRoot,
    });
    await markHumanPurchaseCompletion({
      classification: "SUCCEEDED",
      completionOffset: 42,
      operationId,
      updateId,
      workspaceRoot,
    });
    const expectation = persistedExpectation().expectation;
    const proof = {
      attemptId: expectation.attemptId,
      challengeId: expectation.challengeId,
      requestCommitment: expectation.requestCommitment,
      purchaseCommitment: expectation.purchaseCommitment,
      updateId,
    };
    const completionState = await loadHumanPurchaseJournal({
      operationId,
      workspaceRoot,
    });
    const settlement = authenticateHumanPurchaseProviderSettlement(
      humanSettlementTransaction(completionState.expectation),
      proof,
      completionState.expectation,
    );
    await expect(
      markHumanPurchaseSettlementReconciled({
        operationId,
        settlement: { ...settlement } as never,
        workspaceRoot,
      }),
    ).rejects.toThrow(/not authenticated/iu);
    await markHumanPurchaseSettlementReconciled({
      operationId,
      settlement,
      workspaceRoot,
    });
    await markHumanPurchaseDelivery({
      bodyByteCount: 17,
      bodySha256: sha("paid response body"),
      operationId,
      status: 200,
      workspaceRoot,
    });

    const restored = await loadHumanPurchaseJournal({
      operationId,
      workspaceRoot,
    });
    expect(restored).toMatchObject({
      approvalRequested: { sessionId },
      completion: {
        classification: "SUCCEEDED",
        completionOffset: 42,
        updateId,
      },
      delivery: { bodyByteCount: 17, status: 200 },
      executionStarted: {
        sessionId,
        submissionId: "123e4567-e89b-42d3-a456-426614174000",
        userId: "five-north-human-submitter",
      },
      settlementReconciled: { proof },
      signatureVerified: { preparedTransactionHash, sessionId },
      stage: "delivery",
    });
    expect(
      readAuthenticatedHumanSettlementExpectation(restored.expectation),
    ).toBe(restored.expectation);

    const directory = join(workspaceRoot, "tmp", restored.directoryName);
    const journalSource = await Promise.all(
      [
        "00-intent.json",
        "10-approval-requested.json",
        "20-signature-verified.json",
        "30-execution-started.json",
        "40-completion.json",
        "50-settlement-reconciled.json",
        "60-delivery.json",
      ].map((name) => readFile(join(directory, name), "utf8")),
    );
    expect(journalSource.join("\n")).not.toMatch(
      /private key|"signature"|access.?token|"preparedTransaction"|raw challenge|https?:\/\//iu,
    );
  });

  it("rejects gaps, cross-stage drift, extra fields, and tampering", async () => {
    const { directoryName, operationId } = await initialize();
    await expect(
      markHumanPurchaseSignatureVerified({
        operationId,
        preparedTransactionHash,
        sessionId,
        workspaceRoot,
      }),
    ).rejects.toThrow(/stage|approval/iu);
    await markHumanPurchaseApprovalRequested({
      operationId,
      sessionId,
      workspaceRoot,
    });
    await expect(
      markHumanPurchaseSignatureVerified({
        operationId,
        preparedTransactionHash,
        sessionId: `sha256:${"c".repeat(64)}`,
        workspaceRoot,
      }),
    ).rejects.toThrow(/session/iu);
    await markHumanPurchaseSignatureVerified({
      operationId,
      preparedTransactionHash,
      sessionId,
      workspaceRoot,
    });
    const directory = join(workspaceRoot, "tmp", directoryName);
    await rename(
      join(directory, "10-approval-requested.json"),
      join(directory, "10-approval-hidden.json"),
    );
    await expect(
      loadHumanPurchaseJournal({ operationId, workspaceRoot }),
    ).rejects.toThrow(/gap|out of order/iu);
    await rename(
      join(directory, "10-approval-hidden.json"),
      join(directory, "10-approval-requested.json"),
    );
    const signaturePath = join(directory, "20-signature-verified.json");
    const signature = JSON.parse(
      await readFile(signaturePath, "utf8"),
    ) as Record<string, unknown>;
    await writeFile(
      signaturePath,
      JSON.stringify({ ...signature, signature: "forbidden" }),
      { mode: 0o600 },
    );
    await expect(
      loadHumanPurchaseJournal({ operationId, workspaceRoot }),
    ).rejects.toThrow(/keys|integrity/iu);
    await chmod(signaturePath, 0o644);
    await expect(
      loadHumanPurchaseJournal({ operationId, workspaceRoot }),
    ).rejects.toThrow(/owner-only/iu);
  });

  it("allows one live lease for the exact purchase operation", async () => {
    const { operationId } = await initialize();
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (entered = resolve));
    const first = withHumanPurchaseJournalLease({
      action: async (assertOwned) => {
        await assertOwned();
        entered();
        await blocked;
        return "first";
      },
      operationId,
      workspaceRoot,
    });
    await started;
    await expect(
      withHumanPurchaseJournalLease({
        action: async () => "second",
        operationId,
        workspaceRoot,
      }),
    ).rejects.toThrow(/lease .*held/u);
    release();
    await expect(first).resolves.toBe("first");
  });
});
