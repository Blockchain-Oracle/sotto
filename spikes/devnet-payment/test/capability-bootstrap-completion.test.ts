import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCapabilityBootstrapCompletion } from "../src/capability-bootstrap-completion.js";
import {
  bootstrapRequest,
  checkpointEntry,
  completionEntry,
} from "./capability-bootstrap-completion.fixtures.js";

describe("bounded capability bootstrap completion", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
  });

  it("accepts one exact successful completion through the captured end", async () => {
    const bootstrap = bootstrapRequest();
    const readPage = vi.fn(async () => [
      completionEntry(bootstrap),
      checkpointEntry(42),
    ]);

    await expect(
      readCapabilityBootstrapCompletion({
        beginExclusive: 41,
        readLedgerEndOffset: async () => 42,
        readPage,
        request: bootstrap,
      }),
    ).resolves.toEqual({
      classification: "SUCCEEDED",
      completionOffset: 42,
      updateId: `1220${"b".repeat(64)}`,
    });
    expect(readPage).toHaveBeenCalledWith({
      beginExclusive: 41,
      limit: 1_000,
      parties: [...bootstrap.actAs],
      userId: bootstrap.userId,
    });
  });

  it("pages monotonically until the captured end", async () => {
    const bootstrap = bootstrapRequest();
    const readPage = vi
      .fn()
      .mockResolvedValueOnce([checkpointEntry(42)])
      .mockResolvedValueOnce([completionEntry(bootstrap, { offset: 43 })]);

    await expect(
      readCapabilityBootstrapCompletion({
        beginExclusive: 41,
        readLedgerEndOffset: async () => 43,
        readPage,
        request: bootstrap,
      }),
    ).resolves.toMatchObject({
      classification: "SUCCEEDED",
      completionOffset: 43,
    });
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(readPage.mock.calls[1]![0].beginExclusive).toBe(42);
  });
});
