import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFiveNorthPreapprovalProposal,
  TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
} from "../src/five-north-preapproval-proposal.js";
import {
  initializeFiveNorthPreapprovalJournal,
  markFiveNorthPreapprovalSubmissionStarted,
} from "../src/five-north-preapproval-journal.js";
import {
  recoverJournaledFiveNorthPreapproval,
  startJournaledFiveNorthPreapproval,
} from "../src/five-north-preapproval-journal-runner.js";
import { TRANSFER_PREAPPROVAL_TEMPLATE_ID } from "../src/five-north-transfer-preapproval.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";

const now = Date.parse("2026-07-13T20:00:00.000Z");
const sourceCommit = "a".repeat(40);
const input = {
  expectedDso: `DSO::1220${"3".repeat(64)}`,
  packageId: "f".repeat(64),
  receiverParty: `sotto-spike-provider::1220${"1".repeat(64)}`,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
  userId: "ledger-user-6",
  validatorParty: `five-north-validator::1220${"2".repeat(64)}`,
} as const;

function fixture() {
  const request = buildFiveNorthPreapprovalProposal(input);
  const create = request.commands[0]!.CreateCommand;
  const event = {
    contractId: "00proposal",
    createArgument: create.createArguments,
    observers: [input.validatorParty],
    packageName: "splice-wallet",
    representativePackageId: input.packageId,
    signatories: [input.receiverParty],
    templateId: TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
  };
  const preapprovalEvent = {
    contractId: "00preapproval",
    createArgument: {
      dso: input.expectedDso,
      expiresAt: "2026-10-11T20:00:00.000Z",
      lastRenewedAt: "2026-07-13T19:59:00.000Z",
      provider: input.validatorParty,
      receiver: input.receiverParty,
      validFrom: "2026-07-13T19:59:00.000Z",
    },
    createdAt: "2026-07-13T19:59:00.000Z",
    observers: [],
    packageName: "splice-amulet",
    representativePackageId: TRANSFER_PREAPPROVAL_TEMPLATE_ID.split(":")[0],
    signatories: [input.receiverParty, input.validatorParty, input.expectedDso],
    templateId: "#splice-amulet:Splice.AmuletRules:TransferPreapproval",
  };
  const active = (createdEvent: unknown) => ({
    contractEntry: {
      JsActiveContract: {
        createdEvent,
        reassignmentCounter: 0,
        synchronizerId: input.synchronizerId,
      },
    },
  });
  const snapshot = (contracts: readonly unknown[]) => ({
    activeAtOffset: 42,
    contracts,
  });
  return {
    absent: snapshot([]),
    pending: snapshot([active(event)]),
    ready: snapshot([active(preapprovalEvent)]),
    request,
    response: {
      transaction: {
        commandId: request.commandId,
        events: [{ CreatedEvent: event }],
        offset: 42,
        synchronizerId: input.synchronizerId,
        updateId: `1220${"a".repeat(64)}`,
      },
    },
  } as const;
}

describe("journaled Five North preapproval", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-preapproval-runner-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("allows one concurrent start and one submission", async () => {
    const setup = fixture();
    const readStateContracts = vi
      .fn()
      .mockResolvedValueOnce(setup.absent)
      .mockResolvedValue(setup.pending);
    const submit = vi.fn(async () => setup.response);
    const run = () =>
      startJournaledFiveNorthPreapproval({
        readStateContracts,
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

  it("recovers an ambiguous submission without a resubmit surface", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => {
      throw new AmbiguousTransactionSubmissionError();
    });
    await expect(
      startJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.absent),
        request: setup.request,
        sourceCommit,
        submit,
        workspaceRoot,
      }),
    ).rejects.toThrow("unresolved");

    await expect(
      recoverJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.pending),
        sourceCommit,
        workspaceRoot,
      }),
    ).resolves.toMatchObject({
      outcome: "recovered-pending",
      status: "pending",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("allows intent-only recovery only when trusted live state already exists", async () => {
    const setup = fixture();
    await initializeFiveNorthPreapprovalJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });

    await expect(
      recoverJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.ready),
        sourceCommit,
        workspaceRoot,
      }),
    ).resolves.toMatchObject({ outcome: "recovered-ready", status: "ready" });
  });

  it("fails closed on intent-only recovery with no live state", async () => {
    const setup = fixture();
    await initializeFiveNorthPreapprovalJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });

    await expect(
      recoverJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.absent),
        sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toThrow("unresolved");
  });

  it("adopts the same existing intent and follows pending to ready without submission", async () => {
    const setup = fixture();
    const submit = vi.fn();
    const start = (readStateContracts: () => Promise<unknown>) =>
      startJournaledFiveNorthPreapproval({
        readStateContracts,
        request: setup.request,
        sourceCommit,
        submit,
        workspaceRoot,
      });

    await expect(
      start(vi.fn(async () => setup.pending)),
    ).resolves.toMatchObject({
      status: "pending",
    });
    await expect(start(vi.fn(async () => setup.ready))).resolves.toMatchObject({
      status: "ready",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a different intent even when its command ID is unchanged", async () => {
    const setup = fixture();
    await startJournaledFiveNorthPreapproval({
      readStateContracts: vi.fn(async () => setup.pending),
      request: setup.request,
      sourceCommit,
      submit: vi.fn(),
      workspaceRoot,
    });
    const differentUser = buildFiveNorthPreapprovalProposal({
      ...input,
      userId: "different-ledger-user",
    });
    expect(differentUser.commandId).toBe(setup.request.commandId);

    await expect(
      startJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.pending),
        request: differentUser,
        sourceCommit,
        submit: vi.fn(),
        workspaceRoot,
      }),
    ).rejects.toThrow("intent does not match");
  });

  it("keeps a marker-before-network crash unresolved without resubmission", async () => {
    const setup = fixture();
    const { operationId } = await initializeFiveNorthPreapprovalJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });
    await markFiveNorthPreapprovalSubmissionStarted({
      operationId,
      workspaceRoot,
    });

    await expect(
      recoverJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.absent),
        sourceCommit,
        workspaceRoot,
      }),
    ).rejects.toThrow("unresolved");
  });

  it("rejects recovery from a different source checkpoint", async () => {
    const setup = fixture();
    await initializeFiveNorthPreapprovalJournal({
      request: setup.request,
      sourceCommit,
      workspaceRoot,
    });

    await expect(
      recoverJournaledFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.ready),
        sourceCommit: "b".repeat(40),
        workspaceRoot,
      }),
    ).rejects.toThrow("source commit does not match");
  });
});
