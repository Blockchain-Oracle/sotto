import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  markCapabilityBootstrapResolved,
  markCapabilityBootstrapSubmissionStarted,
} from "../src/capability-bootstrap-journal.js";
import {
  recoverJournaledCapabilityBootstrap,
  startJournaledCapabilityBootstrap,
} from "../src/capability-bootstrap-journal-runner.js";

const now = Date.parse("2026-07-13T19:30:00.000Z");
const sourceCommit = "a".repeat(40);
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

describe("capability bootstrap recovery security", () => {
  let workspaceRoot: string;
  const directory = () =>
    join(workspaceRoot, "tmp", "devnet-capability-bootstrap");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-recovery-security-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("rejects the same command under a different ledger user", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit,
      workspaceRoot,
    });
    const otherRequest = buildBoundedCapabilityBootstrap({
      ...input,
      userId: "different-ledger-user",
    });
    expect(otherRequest.commandId).toBe(request.commandId);
    const readActiveCapabilities = vi.fn();
    const submit = vi.fn();

    await expect(
      startJournaledCapabilityBootstrap({
        readActiveCapabilities,
        request: otherRequest,
        sourceCommit,
        submit,
        workspaceRoot,
      }),
    ).rejects.toThrow("intent does not match");
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("never submits after a durable submission marker", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit,
      workspaceRoot,
    });
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    const readActiveCapabilities = vi.fn(async () => []);
    const submit = vi.fn();

    await expect(
      startJournaledCapabilityBootstrap({
        readActiveCapabilities,
        request,
        sourceCommit,
        submit,
        workspaceRoot,
      }),
    ).rejects.toThrow("outcome is unresolved");
    expect(readActiveCapabilities).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects unresolved recovery under a different source before ACS", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit,
      workspaceRoot,
    });
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    const readActiveCapabilities = vi.fn();

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        sourceCommit: "b".repeat(40),
        workspaceRoot,
      }),
    ).rejects.toThrow("source commit does not match");
    expect(readActiveCapabilities).not.toHaveBeenCalled();
  });

  it("rejects a corrupted terminal chain before reading the ledger", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit,
      workspaceRoot,
    });
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    await markCapabilityBootstrapResolved({
      commandId: request.commandId,
      contractId: "00capability",
      offset: 42,
      operationId,
      outcome: "submitted",
      updateId: `1220${"b".repeat(64)}`,
      workspaceRoot,
    });
    const path = join(directory(), "30-resolved.json");
    const record = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      path,
      JSON.stringify({
        ...record,
        previousRecordSha256: `sha256:${"0".repeat(64)}`,
      }),
    );
    const readActiveCapabilities = vi.fn();

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toThrow("resolution record chain is invalid");
    expect(readActiveCapabilities).not.toHaveBeenCalled();
  });

  it("returns a terminal result without acquiring a foreign lease gate", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit,
      workspaceRoot,
    });
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    const resolution = {
      commandId: request.commandId,
      contractId: "00capability",
      offset: 42,
      operationId,
      outcome: "submitted" as const,
      updateId: `1220${"b".repeat(64)}`,
      workspaceRoot,
    };
    await markCapabilityBootstrapResolved(resolution);
    await writeFile(
      join(directory(), ".gate"),
      JSON.stringify({
        hostname: "foreign-host",
        nonce: "1".repeat(32),
        operationId,
        pid: 1,
        schema: "sotto-capability-bootstrap-lease-v1",
      }),
      { mode: 0o600 },
    );
    const readActiveCapabilities = vi.fn();

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        sourceCommit: "b".repeat(40),
        workspaceRoot,
      }),
    ).resolves.toEqual({
      commandId: resolution.commandId,
      contractId: resolution.contractId,
      offset: resolution.offset,
      outcome: resolution.outcome,
      updateId: resolution.updateId,
    });
    expect(readActiveCapabilities).not.toHaveBeenCalled();
  });
});
