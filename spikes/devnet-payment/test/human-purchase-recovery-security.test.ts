import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHumanPurchaseJournal } from "../src/human-purchase-journal.js";
import { recoverHumanPurchase } from "../src/human-purchase-recovery.js";
import { humanSettlementTransaction } from "./human-purchase-provider-reconciliation.fixtures.js";
import {
  HUMAN_RECOVERY_PROVIDER,
  advanceHumanRecoveryJournal,
  humanRecoveryDependencies,
  humanRecoveryInput,
} from "./human-purchase-recovery.fixtures.js";

describe("human purchase recovery security", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-17T08:00:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-human-recovery-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it.each([
    ["source", { sourceCommit: "e".repeat(40) }],
    ["provider", { providerParty: `${HUMAN_RECOVERY_PROVIDER}-other` }],
  ] as const)("rejects %s mismatch before network", async (_name, override) => {
    const journal = await advanceHumanRecoveryJournal(
      workspaceRoot,
      "execution-started",
    );
    const fixture = humanRecoveryDependencies();

    await expect(
      recoverHumanPurchase(
        {
          ...humanRecoveryInput(workspaceRoot, journal.operationId),
          ...override,
        },
        fixture.dependencies,
      ),
    ).rejects.toThrow(/source commit|provider/iu);
    expect(fixture.createCompletionTransport).not.toHaveBeenCalled();
    expect(fixture.awaitCompletion).not.toHaveBeenCalled();
    expect(fixture.createProviderTransactionReader).not.toHaveBeenCalled();
  });

  it("keeps a mismatched transaction recoverable and retries no command", async () => {
    const journal = await advanceHumanRecoveryJournal(
      workspaceRoot,
      "execution-started",
    );
    const input = humanRecoveryInput(workspaceRoot, journal.operationId);
    const mismatch = humanRecoveryDependencies({ mismatchedTransaction: true });

    await expect(
      recoverHumanPurchase(input, mismatch.dependencies),
    ).rejects.toThrow(/did not reconcile/iu);
    await expect(
      loadHumanPurchaseJournal(journal.common),
    ).resolves.toMatchObject({
      completion: { classification: "SUCCEEDED" },
      stage: "completion",
    });

    const retry = humanRecoveryDependencies();
    retry.readTransaction.mockImplementation(async () => {
      const state = await loadHumanPurchaseJournal(journal.common);
      return humanSettlementTransaction(state.expectation);
    });
    await expect(
      recoverHumanPurchase(input, retry.dependencies),
    ).resolves.toMatchObject({ status: "settled-undelivered" });
    expect(retry.awaitCompletion).not.toHaveBeenCalled();
    expect(retry.createCompletionTransport).not.toHaveBeenCalled();
    expect(retry.readTransaction).toHaveBeenCalledTimes(1);
  });

  it.each(["throws", "returns unresolved"] as const)(
    "leaves execution-started recoverable when completion %s",
    async (mode) => {
      const journal = await advanceHumanRecoveryJournal(
        workspaceRoot,
        "execution-started",
      );
      const input = humanRecoveryInput(workspaceRoot, journal.operationId);
      const unresolved = humanRecoveryDependencies();
      if (mode === "throws") {
        unresolved.awaitCompletion.mockRejectedValue(
          new Error("completion unresolved"),
        );
      } else {
        unresolved.awaitCompletion.mockResolvedValue({
          classification: "ABSENT_COMPLETE",
          completionOffset: 42,
        } as never);
      }

      await expect(
        recoverHumanPurchase(input, unresolved.dependencies),
      ).rejects.toThrow(/completion|classification|status/iu);
      expect((await loadHumanPurchaseJournal(journal.common)).stage).toBe(
        "execution-started",
      );
      expect(unresolved.createProviderTransactionReader).not.toHaveBeenCalled();

      const retry = humanRecoveryDependencies();
      retry.readTransaction.mockImplementation(async () => {
        const state = await loadHumanPurchaseJournal(journal.common);
        return humanSettlementTransaction(state.expectation);
      });
      await expect(
        recoverHumanPurchase(input, retry.dependencies),
      ).resolves.toMatchObject({
        priorStage: "execution-started",
        status: "settled-undelivered",
      });
    },
  );

  it.each(["aborted", "invalid source"] as const)(
    "rejects %s before any network construction",
    async (mode) => {
      const journal = await advanceHumanRecoveryJournal(
        workspaceRoot,
        "execution-started",
      );
      const fixture = humanRecoveryDependencies();
      const controller = new AbortController();
      if (mode === "aborted") controller.abort("private reason");
      const input = {
        ...humanRecoveryInput(workspaceRoot, journal.operationId),
        signal: controller.signal,
        ...(mode === "invalid source" ? { sourceCommit: "main" } : {}),
      };

      await expect(
        recoverHumanPurchase(input, fixture.dependencies),
      ).rejects.toThrow(/cancelled|source commit/iu);
      expect(fixture.createCompletionTransport).not.toHaveBeenCalled();
      expect(fixture.createProviderTransactionReader).not.toHaveBeenCalled();
    },
  );

  it.each(["settlement-reconciled", "delivery"] as const)(
    "returns durable %s with zero network",
    async (stage) => {
      const journal = await advanceHumanRecoveryJournal(workspaceRoot, stage);
      const fixture = humanRecoveryDependencies();

      await expect(
        recoverHumanPurchase(
          humanRecoveryInput(workspaceRoot, journal.operationId),
          fixture.dependencies,
        ),
      ).resolves.toMatchObject({
        operationId: journal.operationId,
        priorStage: stage,
        status: stage === "delivery" ? "delivered" : "settled-undelivered",
      });
      expect(fixture.createCompletionTransport).not.toHaveBeenCalled();
      expect(fixture.awaitCompletion).not.toHaveBeenCalled();
      expect(fixture.createProviderTransactionReader).not.toHaveBeenCalled();
    },
  );
});
