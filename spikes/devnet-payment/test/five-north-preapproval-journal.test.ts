import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFiveNorthPreapprovalProposal } from "../src/five-north-preapproval-proposal.js";
import {
  initializeFiveNorthPreapprovalJournal,
  loadFiveNorthPreapprovalJournalIntent,
  loadFiveNorthPreapprovalJournalState,
  markFiveNorthPreapprovalSubmissionStarted,
  withFiveNorthPreapprovalLease,
} from "../src/five-north-preapproval-journal.js";

const now = Date.parse("2026-07-13T20:00:00.000Z");
const input = {
  expectedDso: `DSO::1220${"3".repeat(64)}`,
  packageId: "f".repeat(64),
  receiverParty: `sotto-spike-provider::1220${"1".repeat(64)}`,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
  userId: "ledger-user-6",
  validatorParty: `five-north-validator::1220${"2".repeat(64)}`,
} as const;

describe("Five North preapproval journal", () => {
  let workspaceRoot: string;
  const directory = () =>
    join(workspaceRoot, "tmp", "devnet-transfer-preapproval-bootstrap");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-preapproval-journal-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("durably claims one owner-only source-pinned intent", async () => {
    const request = buildFiveNorthPreapprovalProposal(input);
    const attempts = await Promise.allSettled([
      initializeFiveNorthPreapprovalJournal({
        request,
        sourceCommit: "a".repeat(40),
        workspaceRoot,
      }),
      initializeFiveNorthPreapprovalJournal({
        request,
        sourceCommit: "a".repeat(40),
        workspaceRoot,
      }),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect((await stat(directory())).mode & 0o077).toBe(0);
    expect((await stat(join(directory(), "00-intent.json"))).mode & 0o077).toBe(
      0,
    );
    expect(
      await loadFiveNorthPreapprovalJournalIntent(workspaceRoot),
    ).toMatchObject({
      intent: { request, sourceCommit: "a".repeat(40) },
    });
  });

  it("rejects a permissive or corrupted intent", async () => {
    const request = buildFiveNorthPreapprovalProposal(input);
    await initializeFiveNorthPreapprovalJournal({
      request,
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });
    const path = join(directory(), "00-intent.json");
    await chmod(path, 0o644);
    await expect(
      loadFiveNorthPreapprovalJournalIntent(workspaceRoot),
    ).rejects.toThrow("owner-only");
    await chmod(path, 0o600);
    const record = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(path, JSON.stringify({ ...record, operationId: "bad" }));
    await expect(
      loadFiveNorthPreapprovalJournalIntent(workspaceRoot),
    ).rejects.toThrow();
  });

  it("persists one chained submission marker", async () => {
    const request = buildFiveNorthPreapprovalProposal(input);
    const { operationId } = await initializeFiveNorthPreapprovalJournal({
      request,
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });

    await markFiveNorthPreapprovalSubmissionStarted({
      operationId,
      workspaceRoot,
    });
    await expect(
      loadFiveNorthPreapprovalJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      operationId,
      submissionStarted: true,
    });
    await expect(
      markFiveNorthPreapprovalSubmissionStarted({ operationId, workspaceRoot }),
    ).rejects.toThrow();
  });

  it("allows only one live preapproval lease", async () => {
    const request = buildFiveNorthPreapprovalProposal(input);
    const { operationId } = await initializeFiveNorthPreapprovalJournal({
      request,
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const first = withFiveNorthPreapprovalLease({
      action: async () => {
        entered();
        await blocked;
        return "first";
      },
      operationId,
      workspaceRoot,
    });
    await started;

    await expect(
      withFiveNorthPreapprovalLease({
        action: async () => "second",
        operationId,
        workspaceRoot,
      }),
    ).rejects.toThrow(/lease .*held/u);
    release();
    await expect(first).resolves.toBe("first");
  });
});
