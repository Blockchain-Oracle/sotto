import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runLiveFiveNorthHumanPurchaseCli } from "../src/live-five-north-human-purchase-cli.js";
import {
  humanPurchaseCliHarness as harness,
  network,
  OPERATION,
  PROVIDER,
  SOURCE_COMMIT,
  UPDATE,
  WORKSPACE,
} from "./live-five-north-human-purchase-cli.fixtures.js";

describe("live Five North human purchase CLI", () => {
  it("checks clean source before loading secrets and emits the journal identity immediately", async () => {
    const state = harness();

    await runLiveFiveNorthHumanPurchaseCli(state.platform, state.dependencies);

    expect(state.events.slice(0, 5)).toEqual([
      "checkpoint",
      "load:/workspace/.env.local",
      "network",
      "provider",
      "on:SIGINT",
    ]);
    expect(state.events.indexOf("stdout")).toBeLessThan(
      state.events.indexOf("after-journal"),
    );
    expect(state.dependencies.start).toHaveBeenCalledWith({
      keyFile: "/workspace/.capability-wallet/five-north-external-payer.key",
      network,
      onJournalInitialized: expect.any(Function),
      port: 8_791,
      providerParty: PROVIDER,
      signal: expect.any(AbortSignal),
      sourceCommit: SOURCE_COMMIT,
      workspaceRoot: WORKSPACE,
    });
    expect(JSON.parse(state.lines[0]!)).toEqual({
      operationId: OPERATION,
      schema: "sotto-five-north-human-purchase-operation-v1",
      sourceCommit: SOURCE_COMMIT,
      status: "journal-initialized",
    });
    expect(JSON.parse(state.lines[1]!)).toEqual({
      completion: { completionOffset: 44, updateId: UPDATE },
      delivery: {
        bodyByteCount: 94,
        bodySha256: `sha256:${"e".repeat(64)}`,
        status: 200,
      },
      operationId: OPERATION,
      schema: "sotto-five-north-human-purchase-v1",
      sourceCommit: SOURCE_COMMIT,
      status: "paid-resource-delivered",
    });
    expect(state.lines.join("\n")).not.toContain("must-not-leak");
  });

  it("passes SIGINT and SIGTERM through one abort signal and removes listeners", async () => {
    const state = harness();
    state.dependencies.start = vi.fn(async (input) => {
      state.listeners.get("SIGTERM")?.();
      expect(input.signal.aborted).toBe(true);
      await input.onJournalInitialized({ operationId: OPERATION });
      return { operationId: OPERATION, status: "wallet-rejected" } as never;
    });

    await runLiveFiveNorthHumanPurchaseCli(state.platform, state.dependencies);

    expect(state.events).toContain("on:SIGINT");
    expect(state.events).toContain("on:SIGTERM");
    expect(state.events.slice(-2)).toEqual(["off:SIGINT", "off:SIGTERM"]);
  });

  it("routes recovery through the restart-only function with no live start inputs", async () => {
    const state = harness();
    state.platform.arguments = ["recover", OPERATION];
    state.dependencies.start = vi.fn(async () => {
      throw new Error("live start must not run");
    });
    state.dependencies.recover = vi.fn(async (input) => {
      expect(input).toEqual({
        network,
        operationId: OPERATION,
        providerParty: PROVIDER,
        signal: expect.any(AbortSignal),
        sourceCommit: SOURCE_COMMIT,
        workspaceRoot: WORKSPACE,
      });
      expect(input).not.toHaveProperty("keyFile");
      expect(input).not.toHaveProperty("port");
      expect(input).not.toHaveProperty("onJournalInitialized");
      return {
        completion: {
          classification: "SUCCEEDED",
          completionOffset: 44,
          updateId: UPDATE,
        },
        operationId: OPERATION,
        priorStage: "completion",
        settlement: { privateTransaction: "must-not-leak" },
        status: "settled-undelivered",
      } as never;
    });

    await runLiveFiveNorthHumanPurchaseCli(state.platform, state.dependencies);

    expect(state.dependencies.start).not.toHaveBeenCalled();
    expect(state.dependencies.recover).toHaveBeenCalledOnce();
    expect(state.lines).toHaveLength(1);
    expect(JSON.parse(state.lines[0]!)).toEqual({
      completion: {
        classification: "SUCCEEDED",
        completionOffset: 44,
        updateId: UPDATE,
      },
      operationId: OPERATION,
      priorStage: "completion",
      schema: "sotto-five-north-human-purchase-v1",
      sourceCommit: SOURCE_COMMIT,
      status: "settled-undelivered",
    });
    expect(state.lines[0]).not.toContain("privateTransaction");
  });

  it.each([
    [[]],
    [["start", "extra"]],
    [["recover"]],
    [["recover", `sha256:${"A".repeat(64)}`]],
    [["recover", "b".repeat(64)]],
    [["unknown"]],
  ])("rejects invalid exact arguments %j", async (arguments_) => {
    const state = harness();
    state.platform.arguments = arguments_;

    await expect(
      runLiveFiveNorthHumanPurchaseCli(state.platform, state.dependencies),
    ).rejects.toThrow(/arguments|operation ID|mode/iu);

    expect(state.dependencies.start).not.toHaveBeenCalled();
    expect(state.dependencies.recover).not.toHaveBeenCalled();
  });

  it("fails closed when the runner returns a different operation", async () => {
    const state = harness();
    state.dependencies.start = vi.fn(async (input) => {
      await input.onJournalInitialized({ operationId: OPERATION });
      return {
        operationId: `sha256:${"f".repeat(64)}`,
        status: "wallet-unsupported",
      } as never;
    });

    await expect(
      runLiveFiveNorthHumanPurchaseCli(state.platform, state.dependencies),
    ).rejects.toThrow(/operation/iu);
  });

  it("registers the exact start and recovery scripts", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(import.meta.dirname, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["human:live"]).toBe(
      "tsx src/live-five-north-human-purchase-cli.ts start",
    );
    expect(packageJson.scripts["human:recover"]).toBe(
      "tsx src/live-five-north-human-purchase-cli.ts recover",
    );
  });
});
