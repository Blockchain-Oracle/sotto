import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import {
  reconciliationRepository,
  type ReconciliationTestContext,
} from "./human-reconciliation.postgres.fixture.js";
import {
  claimTerminalAttempt,
  succeededCheckpoint,
  type TerminalRepository,
} from "./human-reconciliation-fence.postgres.fixture.js";
import { terminalSnapshot } from "./human-reconciliation-fence-state.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime(
    "sotto_reconciliation_fence_replay",
  );
});

afterAll(async () => context?.database.drop());

it("serializes concurrent identical completion into create and replay", async () => {
  const attempt = await claimTerminalAttempt(context, 559, "terminal-race");
  const second = reconciliationRepository(context) as TerminalRepository;
  try {
    const input = succeededCheckpoint(attempt.claim, 45);
    const results = await Promise.all([
      attempt.terminal.completeHumanReconciliation(input),
      second.completeHumanReconciliation(input),
    ]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      "created",
      "replayed",
    ]);
    expect({ ...results[0], outcome: "same" }).toEqual({
      ...results[1],
      outcome: "same",
    });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toMatchObject({ eventCount: "6", resultEventSequence: "6" });
  } finally {
    await attempt.purchase.close();
    await second.close();
  }
});

it("replays the identical checkpoint after restart and lease expiry", async () => {
  const attempt = await claimTerminalAttempt(
    context,
    558,
    "terminal-restart",
    1_000,
  );
  let restarted: TerminalRepository | undefined;
  let originalOpen = true;
  try {
    const input = succeededCheckpoint(attempt.claim, 46);
    const created = await attempt.terminal.completeHumanReconciliation(input);
    const before = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    await attempt.purchase.close();
    originalOpen = false;
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    restarted = reconciliationRepository(context) as TerminalRepository;
    await expect(restarted.completeHumanReconciliation(input)).resolves.toEqual(
      { ...created, outcome: "replayed" },
    );
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(before);
  } finally {
    if (originalOpen) await attempt.purchase.close();
    await restarted?.close();
  }
});
