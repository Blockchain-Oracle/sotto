import { afterAll, beforeAll, expect, it } from "vitest";
import { createPurchaseTestRuntime } from "./purchase-postgres.fixtures.js";
import {
  claimTerminalAttempt,
  rejectedCheckpoint,
  succeededCheckpoint,
  TERMINAL_UPDATE_A,
  TERMINAL_UPDATE_B,
  type TerminalCheckpointInput,
} from "./human-reconciliation-fence.postgres.fixture.js";
import { terminalSnapshot } from "./human-reconciliation-fence-state.postgres.fixture.js";
import type { ReconciliationTestContext } from "./human-reconciliation.postgres.fixture.js";

let context: ReconciliationTestContext;

beforeAll(async () => {
  context = await createPurchaseTestRuntime(
    "sotto_reconciliation_fence_conflicts",
  );
});

afterAll(async () => context?.database.drop());

async function rejectChanged(
  complete: (input: TerminalCheckpointInput) => Promise<unknown>,
  candidates: readonly TerminalCheckpointInput[],
): Promise<void> {
  for (const candidate of candidates) {
    await expect(complete(candidate)).rejects.toMatchObject({
      code: "PURCHASE_CONFLICT",
    });
  }
}

it("independently conflicts on each changed successful result field", async () => {
  const attempt = await claimTerminalAttempt(
    context,
    565,
    "terminal-success-conflicts",
  );
  const original = succeededCheckpoint(attempt.claim, 43);
  try {
    const created =
      await attempt.terminal.completeHumanReconciliation(original);
    const before = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    await rejectChanged(
      (input) => attempt.terminal.completeHumanReconciliation(input),
      [
        {
          ...original,
          completion: {
            classification: "SUCCEEDED",
            completionOffset: 44,
            updateId: TERMINAL_UPDATE_A,
          },
        },
        {
          ...original,
          completion: {
            classification: "SUCCEEDED",
            completionOffset: 43,
            updateId: TERMINAL_UPDATE_B,
          },
        },
        {
          ...original,
          completion: {
            classification: "REJECTED",
            completionOffset: 43,
            statusCode: 7,
          },
        },
        { ...original, expectedReconciliationOffset: 41 },
      ],
    );
    await expect(
      attempt.terminal.completeHumanReconciliation(original),
    ).resolves.toEqual({ ...created, outcome: "replayed" });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(before);
  } finally {
    await attempt.purchase.close();
  }
});

it("independently conflicts on each changed rejected result field", async () => {
  const attempt = await claimTerminalAttempt(
    context,
    564,
    "terminal-rejection-conflicts",
  );
  const original = rejectedCheckpoint(attempt.claim, 44, 7);
  try {
    const created =
      await attempt.terminal.completeHumanReconciliation(original);
    const before = await terminalSnapshot(
      context,
      attempt.initialized.attemptId,
    );
    await rejectChanged(
      (input) => attempt.terminal.completeHumanReconciliation(input),
      [
        {
          ...original,
          completion: {
            classification: "REJECTED",
            completionOffset: 45,
            statusCode: 7,
          },
        },
        {
          ...original,
          completion: {
            classification: "REJECTED",
            completionOffset: 44,
            statusCode: 8,
          },
        },
        {
          ...original,
          completion: {
            classification: "SUCCEEDED",
            completionOffset: 44,
            updateId: TERMINAL_UPDATE_A,
          },
        },
        { ...original, expectedReconciliationOffset: 41 },
      ],
    );
    await expect(
      attempt.terminal.completeHumanReconciliation(original),
    ).resolves.toEqual({ ...created, outcome: "replayed" });
    expect(
      await terminalSnapshot(context, attempt.initialized.attemptId),
    ).toEqual(before);
  } finally {
    await attempt.purchase.close();
  }
});

it("rejects malformed terminal inputs without consuming the lease", async () => {
  const attempt = await claimTerminalAttempt(
    context,
    563,
    "terminal-invalid-input",
  );
  const valid = succeededCheckpoint(attempt.claim);
  const invalid: unknown[] = [
    { ...valid, extra: true },
    {
      ...valid,
      completion: { ...valid.completion, classification: "UNKNOWN" },
    },
    { ...valid, completion: { ...valid.completion, updateId: "invalid" } },
    { ...valid, completion: { ...valid.completion, completionOffset: 42 } },
    {
      ...valid,
      completion: {
        classification: "REJECTED",
        completionOffset: 43,
        statusCode: 0,
      },
    },
    {
      ...valid,
      completion: {
        classification: "REJECTED",
        completionOffset: 43,
        statusCode: 17,
      },
    },
  ];
  try {
    for (const candidate of invalid) {
      await expect(
        attempt.terminal.completeHumanReconciliation(candidate as never),
      ).rejects.toMatchObject({ code: "PURCHASE_PERSISTENCE" });
    }
    await expect(
      attempt.terminal.completeHumanReconciliation(valid),
    ).resolves.toMatchObject({ outcome: "created" });
  } finally {
    await attempt.purchase.close();
  }
});
