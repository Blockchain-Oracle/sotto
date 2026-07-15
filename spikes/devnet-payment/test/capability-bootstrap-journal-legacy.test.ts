import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapCompletionCursor,
} from "../src/capability-bootstrap-journal.js";
import { restoreCapabilityBootstrapJournalIntent } from "../src/capability-bootstrap-journal-intent.js";
import {
  prepareCapabilityBootstrapJournalDirectory,
  writeExclusiveCapabilityBootstrapJson,
} from "../src/capability-bootstrap-journal-storage.js";
import { recoverJournaledCapabilityBootstrap } from "../src/capability-bootstrap-journal-runner.js";
import { bootstrapRequest } from "./capability-bootstrap-completion.fixtures.js";
import {
  LEGACY_BOOTSTRAP_COMMAND_ID,
  LEGACY_DIRECT_BOOTSTRAP_INTENT_V1,
} from "../../../packages/x402-canton/test/bounded-capability-bootstrap-intent-v1.fixture.js";

const sha256 = (value: unknown) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const sha256Text = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

describe("legacy capability bootstrap resolution", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-legacy-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  async function writeLegacyResolution(withCursor: boolean) {
    const request = bootstrapRequest();
    const initialized = await initializeCapabilityBootstrapJournal({
      request,
      sourceCommit: "a".repeat(40),
      workspaceRoot,
    });
    if (withCursor) {
      await markCapabilityBootstrapCompletionCursor({
        beginExclusive: 41,
        operationId: initialized.operationId,
        workspaceRoot,
      });
    }
    const state = await loadCapabilityBootstrapJournalState(workspaceRoot);
    const directory =
      await prepareCapabilityBootstrapJournalDirectory(workspaceRoot);
    const submission = {
      kind: "submission-started",
      operationId: initialized.operationId,
      previousRecordSha256: withCursor
        ? sha256({
            beginExclusive: 41,
            kind: "completion-cursor",
            operationId: initialized.operationId,
            previousRecordSha256: state.recordSha256,
            recordedAt: "2026-07-13T19:30:00.000Z",
            schema: "sotto-capability-bootstrap-journal-v1",
          })
        : state.recordSha256,
      recordedAt: "2026-07-13T19:30:00.000Z",
      schema: "sotto-capability-bootstrap-journal-v1",
    } as const;
    await writeExclusiveCapabilityBootstrapJson(
      directory,
      "10-submission-started.json",
      submission,
    );
    await writeExclusiveCapabilityBootstrapJson(directory, "30-resolved.json", {
      commandId: request.commandId,
      contractId: "00legacy-capability",
      kind: "resolved",
      offset: null,
      operationId: initialized.operationId,
      outcome: "recovered",
      previousRecordSha256: sha256(submission),
      recordedAt: "2026-07-13T19:30:00.000Z",
      schema: "sotto-capability-bootstrap-journal-v1",
      updateId: null,
    });
  }

  it("keeps a cursorless version-one recovery readable for audit", async () => {
    await writeLegacyResolution(false);
    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      completionCursor: null,
      resolution: { offset: null, outcome: "recovered", updateId: null },
    });
  });

  it("never promotes a cursorless resolution to current live evidence", async () => {
    await writeLegacyResolution(false);
    const readActiveCapabilities = vi.fn();
    const readCompletion = vi.fn();

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        readCompletion,
        sourceCommit: "a".repeat(40),
        workspaceRoot,
      }),
    ).rejects.toThrow(/legacy.*audit-only/iu);
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(readCompletion).not.toHaveBeenCalled();
  });

  it("rejects null completion metadata once a cursor exists", async () => {
    await writeLegacyResolution(true);
    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).rejects.toThrow(/resolution.*chain/iu);
  });

  it("loads a frozen networkless v1 journal with its historical identity", async () => {
    const directory =
      await prepareCapabilityBootstrapJournalDirectory(workspaceRoot);
    const payload = structuredClone(LEGACY_DIRECT_BOOTSTRAP_INTENT_V1);
    const source = JSON.stringify(payload);
    await writeExclusiveCapabilityBootstrapJson(directory, "00-intent.json", {
      kind: "intent",
      operationId: sha256Text(`sotto-bootstrap-operation-v1\0${source}`),
      payload,
      payloadSha256: sha256Text(source),
      schema: "sotto-capability-bootstrap-journal-v1",
    });

    const state = await loadCapabilityBootstrapJournalState(workspaceRoot);
    const restored = restoreCapabilityBootstrapJournalIntent(state.intent);

    expect(state).toMatchObject({
      completionCursor: null,
      resolution: null,
      submissionStarted: false,
    });
    expect(restored.commandId).toBe(LEGACY_BOOTSTRAP_COMMAND_ID);
  });
});
