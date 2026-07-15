import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  restoreBoundedCapabilityBootstrapIntent,
} from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapCompletionCursor,
  markCapabilityBootstrapResolved,
  markCapabilityBootstrapSubmissionStarted,
} from "../src/capability-bootstrap-journal.js";

const now = Date.parse("2026-07-13T19:30:00.000Z");
const commit = "a".repeat(40);
const input = {
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-13T20:30:00.000Z",
  instrument: { admin: "DSO::1220dso", id: "Amulet" },
  maximumTotalDebitAtomic: "3250000000",
  network: "canton:devnet" as const,
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

describe("capability bootstrap journal", () => {
  let workspaceRoot: string;
  const directory = () =>
    join(workspaceRoot, "tmp", "devnet-capability-bootstrap");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-bootstrap-"));
  });

  const markCursor = (operationId: string) =>
    markCapabilityBootstrapCompletionCursor({
      beginExclusive: 41,
      operationId,
      workspaceRoot,
    });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("durably claims one owner-only intent and restores it", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const attempts = await Promise.allSettled([
      initializeCapabilityBootstrapJournal({
        request,
        sourceCommit: commit,
        workspaceRoot,
      }),
      initializeCapabilityBootstrapJournal({
        request,
        sourceCommit: commit,
        workspaceRoot,
      }),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const loaded = await loadCapabilityBootstrapJournalIntent(workspaceRoot);
    expect(restoreBoundedCapabilityBootstrapIntent(loaded.intent)).toEqual(
      request,
    );
    expect((await stat(directory())).mode & 0o077).toBe(0);
    expect((await stat(join(directory(), "00-intent.json"))).mode & 0o077).toBe(
      0,
    );
  });

  it("fails closed on a permissive or corrupted intent", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: commit,
      workspaceRoot,
    });
    const path = join(directory(), "00-intent.json");
    await chmod(path, 0o644);
    await expect(
      loadCapabilityBootstrapJournalIntent(workspaceRoot),
    ).rejects.toThrow("owner-only");
    await chmod(path, 0o600);
    const record = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(path, JSON.stringify({ ...record, operationId: "bad" }));
    await expect(
      loadCapabilityBootstrapJournalIntent(workspaceRoot),
    ).rejects.toThrow("metadata is invalid");
  });

  it("persists the submission marker exactly once", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: commit,
      workspaceRoot,
    });

    await markCursor(operationId);
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    expect(
      await loadCapabilityBootstrapJournalState(workspaceRoot),
    ).toMatchObject({ operationId, submissionStarted: true });
    await expect(
      markCapabilityBootstrapSubmissionStarted({ operationId, workspaceRoot }),
    ).rejects.toThrow();
    expect(
      JSON.parse(
        await readFile(join(directory(), "10-submission-started.json"), "utf8"),
      ),
    ).toMatchObject({ kind: "submission-started", operationId });

    await markCapabilityBootstrapResolved({
      commandId: request.commandId,
      contractId: "00capability",
      offset: 42,
      operationId,
      outcome: "submitted",
      updateId: `1220${"b".repeat(64)}`,
      workspaceRoot,
    });
    expect(
      JSON.parse(await readFile(join(directory(), "30-resolved.json"), "utf8")),
    ).toMatchObject({ kind: "resolved", operationId });
    expect(
      await loadCapabilityBootstrapJournalState(workspaceRoot),
    ).toMatchObject({
      resolution: {
        commandId: request.commandId,
        contractId: "00capability",
        offset: 42,
        outcome: "submitted",
        updateId: `1220${"b".repeat(64)}`,
      },
    });
  });

  it("requires a durable completion cursor before submission", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: commit,
      workspaceRoot,
    });

    await expect(
      markCapabilityBootstrapSubmissionStarted({
        operationId,
        workspaceRoot,
      }),
    ).rejects.toThrow(/completion cursor/iu);
  });

  it("persists the completion cursor before the submission marker", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: commit,
      workspaceRoot,
    });

    await markCapabilityBootstrapCompletionCursor({
      beginExclusive: 41,
      operationId,
      workspaceRoot,
    });
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });

    expect(
      JSON.parse(
        await readFile(join(directory(), "05-completion-cursor.json"), "utf8"),
      ),
    ).toMatchObject({ beginExclusive: 41, kind: "completion-cursor" });
    expect(
      await loadCapabilityBootstrapJournalState(workspaceRoot),
    ).toMatchObject({ completionCursor: 41, submissionStarted: true });
  });

  it("rejects a corrupted terminal resolution chain", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: commit,
      workspaceRoot,
    });
    await markCursor(operationId);
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
    const resolution = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      path,
      JSON.stringify({
        ...resolution,
        previousRecordSha256: `sha256:${"0".repeat(64)}`,
      }),
    );

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).rejects.toThrow("resolution record chain is invalid");
  });

  it("rejects a broken submission marker chain", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: commit,
      workspaceRoot,
    });
    await markCursor(operationId);
    await markCapabilityBootstrapSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    const path = join(directory(), "10-submission-started.json");
    const marker = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      path,
      JSON.stringify({
        ...marker,
        previousRecordSha256: `sha256:${"0".repeat(64)}`,
      }),
    );

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).rejects.toThrow("chain is invalid");
  });
});
