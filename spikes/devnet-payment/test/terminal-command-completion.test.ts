import { describe, expect, it, vi } from "vitest";
import { awaitTerminalCommandCompletion } from "../src/terminal-command-completion.js";

const absent = (completionOffset: number) => ({
  classification: "ABSENT_COMPLETE" as const,
  completionOffset,
});
const succeeded = {
  classification: "SUCCEEDED" as const,
  completionOffset: 43,
  updateId: `1220${"b".repeat(64)}`,
};

describe("terminal command completion", () => {
  it("treats an absent snapshot as non-terminal and accepts later success", async () => {
    const readCompletion = vi
      .fn()
      .mockResolvedValueOnce(absent(42))
      .mockResolvedValueOnce(succeeded);
    const waitForRetry = vi.fn(async () => undefined);

    await expect(
      awaitTerminalCommandCompletion({
        attemptLimit: 3,
        readCompletion,
        signal: new AbortController().signal,
        waitForRetry,
      }),
    ).resolves.toEqual(succeeded);
    expect(readCompletion).toHaveBeenCalledTimes(2);
    expect(waitForRetry).toHaveBeenCalledTimes(1);
  });

  it("returns a rejection without retrying", async () => {
    const rejected = {
      classification: "REJECTED" as const,
      completionOffset: 42,
      statusCode: 7,
    };
    const waitForRetry = vi.fn(async () => undefined);

    await expect(
      awaitTerminalCommandCompletion({
        attemptLimit: 3,
        readCompletion: async () => rejected,
        signal: new AbortController().signal,
        waitForRetry,
      }),
    ).resolves.toEqual(rejected);
    expect(waitForRetry).not.toHaveBeenCalled();
  });

  it("leaves an exhausted absent outcome unresolved", async () => {
    const readCompletion = vi.fn(async () => absent(42));

    await expect(
      awaitTerminalCommandCompletion({
        attemptLimit: 2,
        readCompletion,
        signal: new AbortController().signal,
        waitForRetry: async () => undefined,
      }),
    ).rejects.toThrow("command completion requires reconciliation");
    expect(readCompletion).toHaveBeenCalledTimes(2);
  });

  it("cancels a hung retry without exposing the abort reason", async () => {
    const controller = new AbortController();
    let waiting!: () => void;
    const waitStarted = new Promise<void>((resolve) => (waiting = resolve));
    const result = awaitTerminalCommandCompletion({
      attemptLimit: 3,
      readCompletion: async () => absent(42),
      signal: controller.signal,
      waitForRetry: async () => {
        waiting();
        return new Promise<never>(() => undefined);
      },
    });
    await waitStarted;
    controller.abort("private reason");

    await expect(result).rejects.toThrow("command completion cancelled");
  });

  it("cancels a hung completion read without exposing the abort reason", async () => {
    const controller = new AbortController();
    let reading!: () => void;
    const readStarted = new Promise<void>((resolve) => (reading = resolve));
    const result = awaitTerminalCommandCompletion({
      attemptLimit: 3,
      readCompletion: async () => {
        reading();
        return new Promise<never>(() => undefined);
      },
      signal: controller.signal,
      waitForRetry: async () => undefined,
    });
    await readStarted;
    controller.abort("private reason");

    await expect(result).rejects.toThrow("command completion cancelled");
  }, 1_000);
});
