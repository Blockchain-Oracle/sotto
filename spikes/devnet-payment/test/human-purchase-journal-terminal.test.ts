import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeHumanPurchaseJournal,
  loadHumanPurchaseJournal,
  markHumanPurchaseApprovalRequested,
  markHumanPurchaseCompletion,
  markHumanPurchaseExecutionStarted,
  markHumanPurchaseSettlementReconciled,
  markHumanPurchaseSignatureVerified,
} from "../src/human-purchase-journal.js";
import {
  HUMAN_JOURNAL_PREPARED_HASH,
  HUMAN_JOURNAL_SESSION,
  persistedHumanJournalExpectation,
} from "./human-purchase-journal.fixtures.js";

describe("human purchase terminal rejection journal", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-17T08:00:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-human-terminal-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  async function executionStarted() {
    const initialized = await initializeHumanPurchaseJournal({
      beginExclusive: 41,
      expectation: persistedHumanJournalExpectation(),
      workspaceRoot,
    });
    const common = { operationId: initialized.operationId, workspaceRoot };
    await markHumanPurchaseApprovalRequested({
      ...common,
      sessionId: HUMAN_JOURNAL_SESSION,
    });
    await markHumanPurchaseSignatureVerified({
      ...common,
      preparedTransactionHash: HUMAN_JOURNAL_PREPARED_HASH,
      sessionId: HUMAN_JOURNAL_SESSION,
    });
    await markHumanPurchaseExecutionStarted({
      ...common,
      sessionId: HUMAN_JOURNAL_SESSION,
      submissionId: "123e4567-e89b-42d3-a456-426614174000",
      userId: "five-north-human-submitter",
    });
    return common;
  }

  it("persists a valid terminal rejection for restart recovery", async () => {
    const common = await executionStarted();
    await markHumanPurchaseCompletion({
      ...common,
      classification: "REJECTED",
      completionOffset: 42,
      statusCode: 7,
    });

    await expect(loadHumanPurchaseJournal(common)).resolves.toMatchObject({
      completion: {
        classification: "REJECTED",
        completionOffset: 42,
        statusCode: 7,
      },
      settlementReconciled: null,
      stage: "completion",
    });
    await expect(
      markHumanPurchaseSettlementReconciled({
        ...common,
        settlement: Object.freeze({
          version: "sotto-authenticated-human-provider-settlement-v1",
        }) as never,
      }),
    ).rejects.toThrow(/requires successful completion/iu);
  });

  it.each([0, 17])("rejects invalid terminal status code %s", async (code) => {
    const common = await executionStarted();

    await expect(
      markHumanPurchaseCompletion({
        ...common,
        classification: "REJECTED",
        completionOffset: 42,
        statusCode: code,
      }),
    ).rejects.toThrow(/status/iu);
    await expect(loadHumanPurchaseJournal(common)).resolves.toMatchObject({
      completion: null,
      stage: "execution-started",
    });
  });
});
