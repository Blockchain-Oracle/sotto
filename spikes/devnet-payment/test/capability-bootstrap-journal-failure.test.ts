import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapCompletionCursor,
  markCapabilityBootstrapFailed,
  markCapabilityBootstrapSubmissionStarted,
} from "../src/capability-bootstrap-journal.js";
import { bootstrapRequest } from "./capability-bootstrap-completion.fixtures.js";

describe("capability bootstrap terminal failure journal", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-failure-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("persists one hash-chained rejected no-commit result", async () => {
    const request = bootstrapRequest();
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: "a".repeat(40),
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

    await markCapabilityBootstrapFailed({
      commandId: request.commandId,
      completionOffset: 42,
      operationId,
      statusCode: 7,
      workspaceRoot,
    });

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      failure: {
        commandId: request.commandId,
        completionOffset: 42,
        outcome: "rejected",
        statusCode: 7,
      },
      resolution: null,
    });
    const failurePath = join(
      workspaceRoot,
      "tmp/devnet-capability-bootstrap/30-failed.json",
    );
    expect((await stat(failurePath)).mode & 0o077).toBe(0);
    await expect(
      markCapabilityBootstrapFailed({
        commandId: request.commandId,
        completionOffset: 42,
        operationId,
        statusCode: 7,
        workspaceRoot,
      }),
    ).rejects.toThrow();
  });

  it("rejects an orphan terminal failure without a submission marker", async () => {
    await initializeCapabilityBootstrapJournal({
      request: bootstrapRequest(),
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });
    const directory = join(workspaceRoot, "tmp/devnet-capability-bootstrap");
    await mkdir(directory, { mode: 0o700, recursive: true });
    await writeFile(join(directory, "30-failed.json"), "{}\n", {
      mode: 0o600,
    });

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).rejects.toThrow(/failure.*without submission/iu);
  });

  it("rejects a terminal status outside google.rpc.Code", async () => {
    const request = bootstrapRequest();
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: "a".repeat(40),
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

    await expect(
      markCapabilityBootstrapFailed({
        commandId: request.commandId,
        completionOffset: 42,
        operationId,
        statusCode: 17,
        workspaceRoot,
      }),
    ).rejects.toThrow(/chain/iu);
  });
});
