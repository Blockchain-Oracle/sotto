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
    active: { contractEntry: { JsActiveContract: { createdEvent: event } } },
    contractId,
    request,
    response: {
      transaction: {
        commandId: request.commandId,
        events: [{ CreatedEvent: event }],
        offset: 42,
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
    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
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
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      contractId: setup.contractId,
      outcome: "recovered",
    });
    expect(submit).toHaveBeenCalledTimes(1);
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

  it("fails closed when durable resolution no longer matches ACS", async () => {
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

    await expect(
      recoverJournaledCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => []),
        workspaceRoot,
      }),
    ).rejects.toThrow("outcome is unresolved");
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
        workspaceRoot,
      }),
    ).rejects.toThrow("submission was not started");
    expect(readActiveCapabilities).not.toHaveBeenCalled();
  });
});
