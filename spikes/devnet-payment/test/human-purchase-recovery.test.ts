import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadHumanPurchaseJournal,
  markHumanPurchaseApprovalRequested,
  markHumanPurchaseSignatureVerified,
} from "../src/human-purchase-journal.js";
import { recoverHumanPurchase } from "../src/human-purchase-recovery.js";
import {
  HUMAN_RECOVERY_SOURCE_COMMIT,
  advanceHumanRecoveryJournal,
  createHumanRecoveryJournal,
  humanRecoveryDependencies,
  humanRecoveryInput,
} from "./human-purchase-recovery.fixtures.js";
import {
  HUMAN_JOURNAL_PREPARED_HASH,
  HUMAN_JOURNAL_SESSION,
  HUMAN_JOURNAL_UPDATE_ID,
} from "./human-purchase-journal.fixtures.js";
import { humanSettlementTransaction } from "./human-purchase-provider-reconciliation.fixtures.js";

describe("restart-only human purchase recovery", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-17T08:00:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-human-recovery-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it.each(["intent", "approval-requested", "signature-verified"] as const)(
    "returns durable not-executed from %s without network",
    async (stage) => {
      const journal = await createHumanRecoveryJournal(workspaceRoot);
      if (stage !== "intent") {
        await markHumanPurchaseApprovalRequested({
          ...journal.common,
          sessionId: HUMAN_JOURNAL_SESSION,
        });
      }
      if (stage === "signature-verified") {
        await markHumanPurchaseSignatureVerified({
          ...journal.common,
          preparedTransactionHash: HUMAN_JOURNAL_PREPARED_HASH,
          sessionId: HUMAN_JOURNAL_SESSION,
        });
      }
      const fixture = humanRecoveryDependencies();

      await expect(
        recoverHumanPurchase(
          humanRecoveryInput(workspaceRoot, journal.operationId),
          fixture.dependencies,
        ),
      ).resolves.toEqual({
        operationId: journal.operationId,
        priorStage: stage,
        status: "not-executed",
      });
      expect(fixture.createCompletionTransport).not.toHaveBeenCalled();
      expect(fixture.awaitCompletion).not.toHaveBeenCalled();
      expect(fixture.createProviderTransactionReader).not.toHaveBeenCalled();
    },
  );

  it("recovers exact success and persists authenticated settlement", async () => {
    const journal = await advanceHumanRecoveryJournal(
      workspaceRoot,
      "execution-started",
    );
    const fixture = humanRecoveryDependencies();
    fixture.readTransaction.mockImplementation(async () => {
      const state = await loadHumanPurchaseJournal(journal.common);
      return humanSettlementTransaction(state.expectation);
    });

    await expect(
      recoverHumanPurchase(
        humanRecoveryInput(workspaceRoot, journal.operationId),
        fixture.dependencies,
      ),
    ).resolves.toMatchObject({
      completion: {
        classification: "SUCCEEDED",
        completionOffset: 42,
        updateId: HUMAN_JOURNAL_UPDATE_ID,
      },
      operationId: journal.operationId,
      priorStage: "execution-started",
      status: "settled-undelivered",
    });
    expect(fixture.awaitCompletion).toHaveBeenCalledWith({
      beginExclusive: 41,
      commandId: (await loadHumanPurchaseJournal(journal.common)).expectation
        .commandId,
      userId: "five-north-human-submitter",
    });
    expect(fixture.readTransaction).toHaveBeenCalledWith(
      HUMAN_JOURNAL_UPDATE_ID,
    );
    await expect(
      loadHumanPurchaseJournal(journal.common),
    ).resolves.toMatchObject({
      completion: { classification: "SUCCEEDED" },
      settlementReconciled: {
        proof: { updateId: HUMAN_JOURNAL_UPDATE_ID },
      },
      sourceCommit: HUMAN_RECOVERY_SOURCE_COMMIT,
      stage: "settlement-reconciled",
    });
  });

  it("persists and returns a durable rejection without replay", async () => {
    const journal = await advanceHumanRecoveryJournal(
      workspaceRoot,
      "execution-started",
    );
    const first = humanRecoveryDependencies({ completion: "REJECTED" });
    const input = humanRecoveryInput(workspaceRoot, journal.operationId);

    await expect(
      recoverHumanPurchase(input, first.dependencies),
    ).resolves.toEqual({
      completion: {
        classification: "REJECTED",
        completionOffset: 42,
        statusCode: 7,
      },
      operationId: journal.operationId,
      priorStage: "execution-started",
      status: "rejected",
    });
    const repeat = humanRecoveryDependencies();
    await expect(
      recoverHumanPurchase(input, repeat.dependencies),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(repeat.awaitCompletion).not.toHaveBeenCalled();
    expect(repeat.createCompletionTransport).not.toHaveBeenCalled();
    expect(repeat.createProviderTransactionReader).not.toHaveBeenCalled();
  });
});
