import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCapabilityBootstrapJournalState } from "../src/capability-bootstrap-journal.js";
import {
  CapabilityWalletBootstrapApprovalError,
  startCapabilityWalletBootstrap,
} from "../src/capability-wallet-bootstrap-runner.js";
import { capabilityWalletRunnerFixture } from "./capability-wallet-bootstrap-runner.fixtures.js";

describe("wallet-neutral capability bootstrap runner", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-wallet-runner-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("runs one fully verified wallet execution in exact durable order", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);

    await expect(
      startCapabilityWalletBootstrap(fixture.input),
    ).resolves.toEqual({
      commandId: fixture.input.request.commandId,
      contractId: fixture.contractId,
      offset: 52,
      outcome: "submitted",
      updateId: `1220${"e".repeat(64)}`,
    });
    expect(events).toEqual([
      "active-preflight",
      "ledger-end",
      "prepare",
      "official-hash",
      "discover",
      "approval",
      "resolve-key",
      "execute",
      "completion",
      "active-final",
    ]);
    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      executionMode: "wallet",
      resolution: { contractId: fixture.contractId, offset: 52 },
    });
  });

  it("stops an explicit wallet rejection before verification or execution", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(
      workspaceRoot,
      events,
      "rejected",
    );

    await expect(startCapabilityWalletBootstrap(fixture.input)).rejects.toEqual(
      new CapabilityWalletBootstrapApprovalError("rejected", "user-rejected"),
    );
    expect(events).toEqual([
      "active-preflight",
      "ledger-end",
      "prepare",
      "official-hash",
      "discover",
      "approval",
    ]);
  });

  it("stops a prepared-hash rejection before opening the wallet", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(
      workspaceRoot,
      events,
      "wrong-hash",
    );

    await expect(startCapabilityWalletBootstrap(fixture.input)).rejects.toThrow(
      /official.*hash/iu,
    );
    expect(events).toEqual([
      "active-preflight",
      "ledger-end",
      "prepare",
      "official-hash",
    ]);
  });

  it("rejects execution-result drift before completion reconciliation", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);
    const execute = fixture.input.execute;

    await expect(
      startCapabilityWalletBootstrap({
        ...fixture.input,
        execute: async (verified, persist) => ({
          ...(await execute(verified, persist)),
          userId: "different-user",
        }),
      }),
    ).rejects.toThrow(/execution result is inconsistent/iu);
    expect(events).toEqual([
      "active-preflight",
      "ledger-end",
      "prepare",
      "official-hash",
      "discover",
      "approval",
      "resolve-key",
      "execute",
    ]);
  });

  it("rejects a repeated execution marker before the network send", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);
    const execute = fixture.input.execute;

    await expect(
      startCapabilityWalletBootstrap({
        ...fixture.input,
        execute: (verified, persist) =>
          execute(verified, async (started) => {
            await persist(started);
            await persist(started);
          }),
      }),
    ).rejects.toThrow(/execution start was repeated/iu);
    expect(events).not.toContain("execute");
    expect(events).not.toContain("completion");
  });
});
