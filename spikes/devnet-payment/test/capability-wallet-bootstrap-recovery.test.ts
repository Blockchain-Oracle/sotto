import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCapabilityBootstrapJournalState } from "../src/capability-bootstrap-journal.js";
import { DefinitiveCapabilityBootstrapRejectionError } from "../src/capability-bootstrap-runner.js";
import {
  CapabilityWalletBootstrapNotExecutedError,
  recoverCapabilityWalletBootstrap,
} from "../src/capability-wallet-bootstrap-recovery.js";
import { startCapabilityWalletBootstrap } from "../src/capability-wallet-bootstrap-runner.js";
import { capabilityWalletRunnerFixture } from "./capability-wallet-bootstrap-runner.fixtures.js";

describe("wallet capability bootstrap recovery", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-wallet-recovery-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("classifies a timeout before execution-started without ledger reads", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);
    await expect(
      startCapabilityWalletBootstrap({
        ...fixture.input,
        execute: async () => {
          throw new Error("timeout before execute");
        },
      }),
    ).rejects.toThrow("timeout before execute");
    const readActiveCapabilities = vi.fn();
    const readCompletion = vi.fn();

    await expect(
      recoverCapabilityWalletBootstrap({
        readActiveCapabilities,
        readCompletion,
        sourceCommit: fixture.input.sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toEqual(new CapabilityWalletBootstrapNotExecutedError());
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(readCompletion).not.toHaveBeenCalled();
  });

  it.each([
    "timeout after execution-started",
    "malformed HTTP 200",
    "HTTP 400",
    "HTTP 503",
    "process crash",
  ])("recovers %s without replay", async (failure) => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);
    const execute = fixture.input.execute;
    await expect(
      startCapabilityWalletBootstrap({
        ...fixture.input,
        execute: async (verified, persist) => {
          await execute(verified, persist);
          throw new Error(failure);
        },
      }),
    ).rejects.toThrow(failure);
    const beforeRecovery = [...events];

    const expected = {
      commandId: fixture.input.request.commandId,
      contractId: fixture.contractId,
      offset: 52,
      outcome: "recovered" as const,
      updateId: `1220${"e".repeat(64)}`,
    };
    await expect(
      recoverCapabilityWalletBootstrap({
        readActiveCapabilities: fixture.input.readActiveCapabilities,
        readCompletion: fixture.input.readCompletion,
        sourceCommit: fixture.input.sourceCommit,
        workspaceRoot,
      }),
    ).resolves.toEqual(expected);
    expect(beforeRecovery).toEqual([
      "active-preflight",
      "ledger-end",
      "prepare",
      "official-hash",
      "discover",
      "approval",
      "resolve-key",
      "execute",
    ]);
    expect(events.slice(beforeRecovery.length)).toEqual([
      "completion",
      "active-final",
    ]);
    const readActiveCapabilities = vi.fn();
    const readCompletion = vi.fn();
    await expect(
      recoverCapabilityWalletBootstrap({
        readActiveCapabilities,
        readCompletion,
        sourceCommit: fixture.input.sourceCommit,
        workspaceRoot,
      }),
    ).resolves.toEqual(expected);
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(readCompletion).not.toHaveBeenCalled();
  });

  it("persists an exact rejected completion with empty ACS", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);
    const execute = fixture.input.execute;
    await expect(
      startCapabilityWalletBootstrap({
        ...fixture.input,
        execute: async (verified, persist) => {
          await execute(verified, persist);
          throw new Error("HTTP 400");
        },
      }),
    ).rejects.toThrow("HTTP 400");

    await expect(
      recoverCapabilityWalletBootstrap({
        readActiveCapabilities: async () => [],
        readCompletion: async () => ({
          classification: "REJECTED",
          completionOffset: 52,
          statusCode: 3,
        }),
        sourceCommit: fixture.input.sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toEqual(new DefinitiveCapabilityBootstrapRejectionError(52, 3));
    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      failure: { completionOffset: 52, outcome: "rejected", statusCode: 3 },
    });
    const readActiveCapabilities = vi.fn();
    const readCompletion = vi.fn();
    await expect(
      recoverCapabilityWalletBootstrap({
        readActiveCapabilities,
        readCompletion,
        sourceCommit: fixture.input.sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toEqual(new DefinitiveCapabilityBootstrapRejectionError(52, 3));
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(readCompletion).not.toHaveBeenCalled();
  });

  it("leaves conflicting success and empty ACS unresolved", async () => {
    const events: string[] = [];
    const fixture = await capabilityWalletRunnerFixture(workspaceRoot, events);
    const execute = fixture.input.execute;
    await expect(
      startCapabilityWalletBootstrap({
        ...fixture.input,
        execute: async (verified, persist) => {
          await execute(verified, persist);
          throw new Error("crash");
        },
      }),
    ).rejects.toThrow("crash");

    await expect(
      recoverCapabilityWalletBootstrap({
        readActiveCapabilities: async () => [],
        readCompletion: fixture.input.readCompletion,
        sourceCommit: fixture.input.sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toThrow(/successful completion.*no exact active/iu);
    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({ failure: null, resolution: null });
  });
});
