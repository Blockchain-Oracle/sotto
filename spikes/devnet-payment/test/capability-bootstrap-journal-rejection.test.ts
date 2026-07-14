import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import { loadCapabilityBootstrapJournalState } from "../src/capability-bootstrap-journal.js";
import {
  recoverJournaledCapabilityBootstrap,
  startJournaledCapabilityBootstrap,
} from "../src/capability-bootstrap-journal-runner.js";
import { DefinitiveCapabilityBootstrapRejectionError } from "../src/capability-bootstrap-runner.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";

const sourceCommit = "a".repeat(40);
const buildRequest = () =>
  buildBoundedCapabilityBootstrap({
    agentParty: "sotto-policy-agent::1220participant",
    allowedRecipient: "sotto-spike-provider::1220participant",
    allowedResourceHash: `sha256:${"a".repeat(64)}`,
    expiresAt: "2026-07-13T20:30:00.000Z",
    instrument: { admin: "DSO::1220dso", id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    payerParty: "sotto-spike-payer::1220participant",
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "10000000000",
    synchronizerId: "global-domain::1220synchronizer",
    transferFactoryContractId: "00transferfactory",
    userId: "ledger-user-6",
  });

describe("journaled capability bootstrap rejection", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-rejection-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("persists a rejected completion and stops recovery before network access", async () => {
    const request = buildRequest();
    const submit = vi.fn(async () => {
      throw new AmbiguousTransactionSubmissionError();
    });
    await expect(
      startJournaledCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => []),
        readCompletion: vi.fn(async () => ({
          classification: "REJECTED" as const,
          completionOffset: 42,
          statusCode: 7,
        })),
        readLedgerEndOffset: vi.fn(async () => 41),
        request,
        sourceCommit,
        submit,
        workspaceRoot,
      }),
    ).rejects.toBeInstanceOf(DefinitiveCapabilityBootstrapRejectionError);

    await expect(
      loadCapabilityBootstrapJournalState(workspaceRoot),
    ).resolves.toMatchObject({
      failure: {
        commandId: request.commandId,
        completionOffset: 42,
        outcome: "rejected",
        statusCode: 7,
      },
    });
    const readActiveCapabilities = vi.fn();
    const readCompletion = vi.fn();
    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        readCompletion,
        sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toBeInstanceOf(DefinitiveCapabilityBootstrapRejectionError);
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(readCompletion).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
