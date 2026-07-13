import { describe, expect, it, vi } from "vitest";
import {
  prepareOwnerOnlyBootstrapJournalDirectory,
  type OwnerOnlyDirectoryOperations,
} from "../src/capability-bootstrap-journal-storage.js";

describe("capability bootstrap journal directory", () => {
  it("persists each newly created parent entry in order", async () => {
    const calls: string[] = [];
    const operations: OwnerOnlyDirectoryOperations = {
      lstat: vi.fn(async (path) => {
        calls.push(`lstat:${path}`);
        return {
          isDirectory: () => true,
          isSymbolicLink: () => false,
          mode: path === "/workspace/tmp" ? 0o755 : 0o700,
          uid: typeof process.getuid === "function" ? process.getuid() : 0,
        };
      }),
      mkdir: vi.fn(async (path) => {
        calls.push(`mkdir:${path}`);
      }),
      syncDirectory: vi.fn(async (path) => {
        calls.push(`sync:${path}`);
      }),
    };

    await expect(
      prepareOwnerOnlyBootstrapJournalDirectory(
        "/workspace",
        "devnet-test",
        operations,
      ),
    ).resolves.toBe("/workspace/tmp/devnet-test");
    expect(calls).toEqual([
      "mkdir:/workspace/tmp",
      "lstat:/workspace/tmp",
      "sync:/workspace",
      "mkdir:/workspace/tmp/devnet-test",
      "lstat:/workspace/tmp/devnet-test",
      "sync:/workspace/tmp",
    ]);
  });
});
