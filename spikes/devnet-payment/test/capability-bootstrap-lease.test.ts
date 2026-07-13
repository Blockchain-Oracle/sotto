import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  withCapabilityBootstrapLease,
} from "../src/capability-bootstrap-journal.js";

const input = {
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-13T20:30:00.000Z",
  instrument: { admin: "DSO::1220dso", id: "Amulet" },
  maximumTotalDebitAtomic: "3250000000",
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

describe("capability bootstrap lease", () => {
  let workspaceRoot: string;
  const directory = () =>
    join(workspaceRoot, "tmp", "devnet-capability-bootstrap");

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-bootstrap-lease-"));
  });
  afterEach(async () => rm(workspaceRoot, { force: true, recursive: true }));

  async function initialized() {
    return initializeCapabilityBootstrapJournal({
      request: buildBoundedCapabilityBootstrap(input),
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });
  }

  it("allows only one live lease owner", async () => {
    const { operationId } = await initialized();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const first = withCapabilityBootstrapLease({
      action: async (assertOwned) => {
        await assertOwned();
        entered();
        await blocked;
        return "first";
      },
      operationId,
      workspaceRoot,
    });
    await started;
    await expect(
      withCapabilityBootstrapLease({
        action: async () => "second",
        operationId,
        workspaceRoot,
      }),
    ).rejects.toThrow(/lease .*held/u);
    release();
    await expect(first).resolves.toBe("first");
  });

  it("reclaims only a same-host lease whose process no longer exists", async () => {
    const { operationId } = await initialized();
    await writeFile(
      join(directory(), ".lease"),
      JSON.stringify({
        hostname: hostname(),
        nonce: "0".repeat(32),
        operationId,
        pid: 2_147_483_647,
        schema: "sotto-capability-bootstrap-lease-v1",
      }),
      { mode: 0o600 },
    );
    await expect(
      withCapabilityBootstrapLease({
        action: async () => "recovered",
        operationId,
        workspaceRoot,
      }),
    ).resolves.toBe("recovered");
  });

  it("reclaims a same-host acquisition gate whose process no longer exists", async () => {
    const { operationId } = await initialized();
    await writeFile(
      join(directory(), ".gate"),
      JSON.stringify({
        hostname: hostname(),
        nonce: "0".repeat(32),
        operationId,
        pid: 2_147_483_647,
        schema: "sotto-capability-bootstrap-lease-v1",
      }),
      { mode: 0o600 },
    );
    await expect(
      withCapabilityBootstrapLease({
        action: async () => "recovered",
        operationId,
        workspaceRoot,
      }),
    ).resolves.toBe("recovered");
  });

  it.each([
    ["live", hostname(), process.pid],
    ["foreign", "other-host", 2_147_483_647],
  ] as const)("fails closed on a %s acquisition gate", async (_, host, pid) => {
    const { operationId } = await initialized();
    await writeFile(
      join(directory(), ".gate"),
      JSON.stringify({
        hostname: host,
        nonce: "0".repeat(32),
        operationId,
        pid,
        schema: "sotto-capability-bootstrap-lease-v1",
      }),
      { mode: 0o600 },
    );
    const action = vi.fn(async () => "unsafe");
    await expect(
      withCapabilityBootstrapLease({ action, operationId, workspaceRoot }),
    ).rejects.toThrow("bootstrap lease gate is held");
    expect(action).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid acquisition gate", async () => {
    const { operationId } = await initialized();
    await writeFile(join(directory(), ".gate"), "stale", { mode: 0o600 });
    const action = vi.fn(async () => "unsafe");
    await expect(
      withCapabilityBootstrapLease({ action, operationId, workspaceRoot }),
    ).rejects.toThrow("bootstrap lease gate is held");
    expect(action).not.toHaveBeenCalled();
  });
});
