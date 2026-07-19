import { describe, expect, it, vi } from "vitest";
import { readCleanSourceCheckpoint } from "../src/clean-source-checkpoint.js";

describe("clean source checkpoint", () => {
  it("returns only one exact clean Git commit", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(`${"a".repeat(40)}\n`)
      .mockResolvedValueOnce("");

    await expect(
      readCleanSourceCheckpoint("/workspace", execute),
    ).resolves.toBe("a".repeat(40));
  });

  it.each([
    ["dirty source", `${"a".repeat(40)}\n`, " M file.ts\n"],
    ["invalid commit", "main\n", ""],
  ])("rejects %s", async (_label, head, status) => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(status);

    await expect(
      readCleanSourceCheckpoint("/workspace", execute),
    ).rejects.toThrow();
  });
});
