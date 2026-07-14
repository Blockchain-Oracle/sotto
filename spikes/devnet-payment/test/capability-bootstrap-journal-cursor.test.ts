import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapCompletionCursor,
} from "../src/capability-bootstrap-journal.js";

const sourceCommit = "a".repeat(40);
const request = () =>
  buildBoundedCapabilityBootstrap({
    agentParty: "sotto-agent::1220participant",
    allowedRecipient: "sotto-provider::1220participant",
    allowedResourceHash: `sha256:${"a".repeat(64)}`,
    expiresAt: "2026-07-13T20:30:00.000Z",
    instrument: { admin: "DSO::1220dso", id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    payerParty: "sotto-payer::1220participant",
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "3250000000",
    synchronizerId: "global-domain::1220synchronizer",
    transferFactoryContractId: "00factory",
    userId: "ledger-user-6",
  });

describe("capability bootstrap completion cursor", () => {
  let workspaceRoot: string;
  const cursorPath = () =>
    join(
      workspaceRoot,
      "tmp/devnet-capability-bootstrap/05-completion-cursor.json",
    );

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-cursor-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid offset %s",
    async (beginExclusive) => {
      const { operationId } = await initializeCapabilityBootstrapJournal({
        request: request(),
        sourceCommit,
        workspaceRoot,
      });

      await expect(
        markCapabilityBootstrapCompletionCursor({
          beginExclusive,
          operationId,
          workspaceRoot,
        }),
      ).rejects.toThrow(/cursor.*invalid/iu);
    },
  );

  it("rejects a corrupted cursor chain", async () => {
    const { operationId } = await initializeCapabilityBootstrapJournal({
      request: request(),
      sourceCommit,
      workspaceRoot,
    });
    await markCapabilityBootstrapCompletionCursor({
      beginExclusive: 41,
      operationId,
      workspaceRoot,
    });
    const record = JSON.parse(await readFile(cursorPath(), "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      cursorPath(),
      JSON.stringify({
        ...record,
        previousRecordSha256: `sha256:${"0".repeat(64)}`,
      }),
    );

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).rejects.toThrow(/cursor chain/iu);
  });
});
