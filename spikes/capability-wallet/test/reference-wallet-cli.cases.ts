import { describe, expect, it, vi } from "vitest";
import { confirmReferenceWalletApproval } from "../src/reference-wallet-cli.js";

export function registerReferenceWalletCliCases(): void {
  describe("reference wallet CLI approval", () => {
    it("confirms the exact handoff only after displaying the summary", async () => {
      const events: string[] = [];
      await confirmReferenceWalletApproval({
        approved: true,
        handoffId: "abc123",
        present: (summary) => {
          events.push(`present:${summary}`);
        },
        prompt: async () => {
          events.push("prompt");
          return "abc123";
        },
        summary: '{"action":"create-purchase-capability"}',
      });
      expect(events).toEqual([
        'present:{"action":"create-purchase-capability"}',
        "prompt",
      ]);
    });

    it("rejects a mismatched post-display confirmation", async () => {
      await expect(
        confirmReferenceWalletApproval({
          approved: true,
          handoffId: "abc123",
          present: () => undefined,
          prompt: async () => "another-session",
          summary: "verified summary",
        }),
      ).rejects.toThrow(/confirmation/iu);
    });

    it("rejects without prompting", async () => {
      const prompt = vi.fn(async () => "abc123");
      await confirmReferenceWalletApproval({
        approved: false,
        handoffId: "abc123",
        present: () => undefined,
        prompt,
        summary: "verified summary",
      });
      expect(prompt).not.toHaveBeenCalled();
    });
  });
}
