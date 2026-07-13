import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import { initializeCapabilityBootstrapJournal } from "../src/capability-bootstrap-journal.js";
import {
  recoverJournaledCapabilityBootstrap,
  startJournaledCapabilityBootstrap,
} from "../src/capability-bootstrap-journal-runner.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";

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
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

function fixture() {
  const request = buildBoundedCapabilityBootstrap(input);
  const create = request.commands[0]!.CreateCommand;
  const contractId = "00capability";
  const event = {
    contractId,
    createArgument: create.createArguments,
    observers: [input.agentParty],
    packageName: "sotto-control",
    signatories: [input.payerParty],
    templateId: create.templateId,
  };
  return {
    active: {
      contractEntry: {
        JsActiveContract: {
          createdEvent: event,
          synchronizerId: input.synchronizerId,
        },
      },
    },
    contractId,
    request,
    response: {
      transaction: {
        commandId: request.commandId,
        events: [{ CreatedEvent: event }],
        offset: 42,
        synchronizerId: input.synchronizerId,
        updateId: `1220${"b".repeat(64)}`,
      },
    },
  } as const;
}

describe("journaled capability bootstrap", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-journal-runner-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("allows only one concurrent start and one submission", async () => {
    const setup = fixture();
    const readActiveCapabilities = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([setup.active]);
    const submit = vi.fn(async () => setup.response);
    const run = () =>
      startJournaledCapabilityBootstrap({
        readActiveCapabilities,
        request: setup.request,
        sourceCommit,
        submit,
        workspaceRoot,
      });

    const outcomes = await Promise.allSettled([run(), run()]);
    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.map(({ value }) => value)).toEqual(
      fulfilled.map(() => ({
        commandId: setup.request.commandId,
        contractId: setup.contractId,
        offset: 42,
        outcome: "submitted",
        updateId: `1220${"b".repeat(64)}`,
      })),
    );
    for (const outcome of rejected) {
      expect(String(outcome.reason)).toContain("lease");
    }
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("recovers an unknown outcome without resubmitting", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => {
      throw new AmbiguousTransactionSubmissionError();
    });
    await expect(
      startJournaledCapabilityBootstrap({
        readActiveCapabilities: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        request: setup.request,
        sourceCommit,
        submit,
        workspaceRoot,
      }),
    ).rejects.toThrow("outcome is unresolved");

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => [setup.active]),
        sourceCommit,
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      contractId: setup.contractId,
      outcome: "recovered",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("resumes an identical intent-only start with one submission", async () => {
    const setup = fixture();
    await initializeCapabilityBootstrapJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });
    vi.setSystemTime(now + 60_000);
    const rebuiltRequest = buildBoundedCapabilityBootstrap(input);
    expect(rebuiltRequest).toEqual(setup.request);
    const submit = vi.fn(async () => setup.response);

    await expect(
      startJournaledCapabilityBootstrap({
        readActiveCapabilities: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([setup.active]),
        request: rebuiltRequest,
        sourceCommit,
        submit,
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      contractId: setup.contractId,
      outcome: "submitted",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("rejects a different source for an existing intent before ledger access", async () => {
    const setup = fixture();
    await initializeCapabilityBootstrapJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });
    const readActiveCapabilities = vi.fn();
    const submit = vi.fn();

    await expect(
      startJournaledCapabilityBootstrap({
        readActiveCapabilities,
        request: setup.request,
        sourceCommit: "b".repeat(40),
        submit,
        workspaceRoot,
      }),
    ).rejects.toThrow("intent does not match");
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("returns one durable terminal result across repeat recovery", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => setup.response);
    await startJournaledCapabilityBootstrap({
      readActiveCapabilities: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([setup.active]),
      request: setup.request,
      sourceCommit,
      submit,
      workspaceRoot,
    });
    const recover = () =>
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => [setup.active]),
        sourceCommit,
        workspaceRoot,
      });

    await expect(recover()).resolves.toEqual({
      commandId: setup.request.commandId,
      contractId: setup.contractId,
      offset: 42,
      outcome: "submitted",
      updateId: `1220${"b".repeat(64)}`,
    });
    await expect(recover()).resolves.toEqual({
      commandId: setup.request.commandId,
      contractId: setup.contractId,
      offset: 42,
      outcome: "submitted",
      updateId: `1220${"b".repeat(64)}`,
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("returns durable resolution after the original capability leaves ACS", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => setup.response);
    await startJournaledCapabilityBootstrap({
      readActiveCapabilities: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([setup.active]),
      request: setup.request,
      sourceCommit,
      submit,
      workspaceRoot,
    });

    const readActiveCapabilities = vi.fn(async () => []);
    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        sourceCommit,
        workspaceRoot,
      }),
    ).resolves.toEqual({
      commandId: setup.request.commandId,
      contractId: setup.contractId,
      offset: 42,
      outcome: "submitted",
      updateId: `1220${"b".repeat(64)}`,
    });
    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("never submits from an intent-only recovery", async () => {
    const setup = fixture();
    await initializeCapabilityBootstrapJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });
    const readActiveCapabilities = vi.fn(async () => [setup.active]);

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities,
        sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toThrow("submission was not started");
    expect(readActiveCapabilities).not.toHaveBeenCalled();
  });
});
