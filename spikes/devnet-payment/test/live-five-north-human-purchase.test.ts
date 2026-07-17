import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLiveFiveNorthHumanPurchase } from "../src/live-five-north-human-purchase.js";
import {
  liveHumanPurchaseDependencies as dependencies,
  liveHumanPurchaseInput as input,
  OPERATION,
  SOURCE_COMMIT,
  UPDATE,
} from "./live-five-north-human-purchase.fixtures.js";

describe("live Five North human purchase", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-17T08:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("settles one exact wallet-approved purchase and unlocks the authentic 200", async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    const result = await runLiveFiveNorthHumanPurchase(
      input(events),
      ports as never,
    );

    expect(result).toMatchObject({
      status: "paid-resource-delivered",
      completion: { completionOffset: 42, updateId: UPDATE },
      delivery: { status: 200 },
    });
    expect(events).toEqual([
      "profile",
      "authority",
      "wallet",
      "rules",
      "provider-start",
      "prepare",
      "completion-cursor",
      "journal-intent",
      "journal-announced",
      "lease-start",
      "lease-owned",
      "approval",
      "journal-approval",
      "journal-signature",
      "lease-owned",
      "execute",
      "journal-execution",
      "completion",
      "journal-completion",
      "provider-transaction",
      "journal-settlement",
      "lease-owned",
      "paid-retry",
      "provider-transaction",
      "journal-delivery",
      "provider-close",
    ]);
    expect(ports.markSettlementReconciled).toHaveBeenCalledWith({
      operationId: OPERATION,
      settlement: { authenticated: true },
      workspaceRoot: "/workspace",
    });
    expect(ports.initializeJournal).toHaveBeenCalledWith(
      expect.objectContaining({ sourceCommit: SOURCE_COMMIT }),
    );
  });

  it.each([
    ["rejected", "wallet-rejected", true],
    ["unsupported", "wallet-unsupported", false],
  ] as const)(
    "stops a %s wallet before execution and still closes the provider",
    async (outcome, status, approvalJournalled) => {
      const events: string[] = [];
      const result = await runLiveFiveNorthHumanPurchase(
        input(),
        dependencies(events, outcome) as never,
      );

      expect(result.status).toBe(status);
      expect(events).not.toContain("execute");
      expect(events).not.toContain("completion");
      expect(events).not.toContain("paid-retry");
      expect(events.includes("journal-approval")).toBe(approvalJournalled);
      expect(events.at(-1)).toBe("provider-close");
    },
  );

  it("journals a terminal rejection and never reconciles, retries, or resubmits", async () => {
    const events: string[] = [];
    const ports = dependencies(events, "verified", "REJECTED");

    await expect(
      runLiveFiveNorthHumanPurchase(input(), ports as never),
    ).rejects.toThrow(/rejected.*7/iu);

    expect(ports.markCompletion).toHaveBeenCalledWith({
      classification: "REJECTED",
      completionOffset: 42,
      operationId: OPERATION,
      statusCode: 7,
      workspaceRoot: "/workspace",
    });
    expect(events.filter((event) => event === "execute")).toHaveLength(1);
    expect(events).not.toContain("provider-transaction");
    expect(events).not.toContain("paid-retry");
    expect(events.at(-1)).toBe("provider-close");
  });

  it("stops before wallet approval when the recoverable operation cannot be announced", async () => {
    const events: string[] = [];
    const candidate = input();

    await expect(
      runLiveFiveNorthHumanPurchase(
        {
          ...candidate,
          onJournalInitialized: async () => {
            throw new Error("stdout unavailable");
          },
        },
        dependencies(events) as never,
      ),
    ).rejects.toThrow(/stdout unavailable/iu);

    expect(events).toContain("journal-intent");
    expect(events).not.toContain("approval");
    expect(events).not.toContain("execute");
    expect(events.at(-1)).toBe("provider-close");
  });
});
