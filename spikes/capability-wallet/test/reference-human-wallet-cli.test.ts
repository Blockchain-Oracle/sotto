import { describe, expect, it, vi } from "vitest";
import {
  confirmReferenceHumanWalletApproval,
  runReferenceHumanWalletCli,
} from "../src/reference-human-wallet-cli.js";

describe("reference human wallet CLI", () => {
  it("approves only after the exact post-summary handoff confirmation", async () => {
    const events: string[] = [];
    await confirmReferenceHumanWalletApproval({
      handoffId: "a".repeat(64),
      present: (summary) => {
        events.push(`present:${summary}`);
      },
      prompt: async () => {
        events.push("prompt");
        return "a".repeat(64);
      },
      summary: '{"amount":"0.25"}',
    });

    expect(events).toEqual(['present:{"amount":"0.25"}', "prompt"]);
  });

  it("rejects a mismatched approval confirmation before the runner continues", async () => {
    await expect(
      confirmReferenceHumanWalletApproval({
        handoffId: "a".repeat(64),
        present: () => undefined,
        prompt: async () => "b".repeat(64),
        summary: "verified purchase",
      }),
    ).rejects.toThrow(/confirmation/iu);
  });

  it("supports explicit rejection without a key or prompt", async () => {
    const prompt = vi.fn(async () => "unused");
    const runApproval = vi.fn(async (input: Record<string, unknown>) => {
      expect(input).toMatchObject({
        approved: false,
        handoffId: "b".repeat(64),
        rootDirectory: "/wallet/.capability-wallet",
      });
      expect(input).not.toHaveProperty("keyFile");
      await (input.presentSummary as (summary: string) => Promise<void>)(
        "verified purchase",
      );
      return { outcome: "rejected" as const };
    });
    const present = vi.fn();

    const outcome = await runReferenceHumanWalletCli(
      [
        "--root",
        "/wallet/.capability-wallet",
        "--handoff-id",
        "b".repeat(64),
        "--reject",
      ],
      { present, prompt, runApproval: runApproval as never },
    );

    expect(outcome).toBe("rejected");
    expect(present).toHaveBeenCalledWith("verified purchase");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("passes an approved request to the wallet-only runner", async () => {
    const runApproval = vi.fn(async (input: Record<string, unknown>) => {
      expect(input).toMatchObject({
        approved: true,
        handoffId: "c".repeat(64),
        keyFile: "/wallet/payer.key",
        rootDirectory: "/wallet/.capability-wallet",
      });
      await (input.presentSummary as (summary: string) => Promise<void>)(
        "verified purchase",
      );
      return { outcome: "approved" as const };
    });
    const prompt = vi.fn(async () => "c".repeat(64));

    const outcome = await runReferenceHumanWalletCli(
      [
        "--root",
        "/wallet/.capability-wallet",
        "--handoff-id",
        "c".repeat(64),
        "--approve",
        "--key-file",
        "/wallet/payer.key",
      ],
      { present: vi.fn(), prompt, runApproval: runApproval as never },
    );

    expect(outcome).toBe("approved");
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous or keyless approval arguments", async () => {
    const dependencies = {
      present: vi.fn(),
      prompt: vi.fn(async () => "unused"),
      runApproval: vi.fn() as never,
    };
    await expect(
      runReferenceHumanWalletCli(
        [
          "--root",
          "/wallet/.capability-wallet",
          "--handoff-id",
          "d".repeat(64),
          "--approve",
          "--reject",
        ],
        dependencies,
      ),
    ).rejects.toThrow(/usage/iu);
    await expect(
      runReferenceHumanWalletCli(
        [
          "--root",
          "/wallet/.capability-wallet",
          "--handoff-id",
          "d".repeat(64),
          "--approve",
        ],
        dependencies,
      ),
    ).rejects.toThrow(/usage/iu);
  });
});
