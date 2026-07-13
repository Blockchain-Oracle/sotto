import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFiveNorthPreapprovalProposal,
  TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
} from "../src/five-north-preapproval-proposal.js";
import {
  recoverFiveNorthPreapproval,
  runFiveNorthPreapproval,
} from "../src/five-north-preapproval-runner.js";
import { TRANSFER_PREAPPROVAL_TEMPLATE_ID } from "../src/five-north-transfer-preapproval.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";

const now = Date.parse("2026-07-13T20:00:00.000Z");
const input = {
  expectedDso: `DSO::1220${"3".repeat(64)}`,
  packageId: "f".repeat(64),
  receiverParty: `sotto-spike-provider::1220${"1".repeat(64)}`,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
  userId: "ledger-user-6",
  validatorParty: `five-north-validator::1220${"2".repeat(64)}`,
} as const;
const updateId = `1220${"a".repeat(64)}`;

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
    pending: snapshot([active(event)]),
    ready: snapshot([active(preapprovalEvent)]),
    absent: snapshot([]),
    request,
    response: {
      transaction: {
        commandId: request.commandId,
        events: [{ CreatedEvent: event }],
        offset: 42,
        synchronizerId: input.synchronizerId,
        updateId,
      },
    },
  } as const;
}

describe("Five North preapproval runner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an existing preapproval with zero submission", async () => {
    const setup = fixture();
    const submit = vi.fn();

    await expect(
      runFiveNorthPreapproval({
        persistIntent: vi.fn(),
        persistSubmissionStarted: vi.fn(),
        readStateContracts: vi.fn(async () => setup.ready),
        request: setup.request,
        submit,
      }),
    ).resolves.toMatchObject({ outcome: "already-ready", status: "ready" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("returns an existing exact proposal with zero submission", async () => {
    const setup = fixture();
    const submit = vi.fn();

    await expect(
      runFiveNorthPreapproval({
        persistIntent: vi.fn(),
        persistSubmissionStarted: vi.fn(),
        readStateContracts: vi.fn(async () => setup.pending),
        request: setup.request,
        submit,
      }),
    ).resolves.toMatchObject({
      outcome: "already-pending",
      proposalContractId: "00proposal",
      status: "pending",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits once and accepts the independently-created preapproval", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => setup.response);
    const readStateContracts = vi
      .fn()
      .mockResolvedValueOnce(setup.absent)
      .mockResolvedValueOnce(setup.ready);

    await expect(
      runFiveNorthPreapproval({
        persistIntent: vi.fn(),
        persistSubmissionStarted: vi.fn(),
        readStateContracts,
        request: setup.request,
        submit,
      }),
    ).resolves.toMatchObject({
      outcome: "submitted-ready",
      proposalUpdateId: updateId,
      status: "ready",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("reconciles an ambiguous submission to one pending proposal", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => {
      throw new AmbiguousTransactionSubmissionError();
    });
    const readStateContracts = vi
      .fn()
      .mockResolvedValueOnce(setup.absent)
      .mockResolvedValueOnce(setup.pending);

    await expect(
      runFiveNorthPreapproval({
        persistIntent: vi.fn(),
        persistSubmissionStarted: vi.fn(),
        readStateContracts,
        request: setup.request,
        submit,
      }),
    ).resolves.toMatchObject({
      outcome: "reconciled-pending",
      proposalContractId: "00proposal",
      status: "pending",
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("recovers readiness without any submit capability", async () => {
    const setup = fixture();

    await expect(
      recoverFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.ready),
        request: setup.request,
      }),
    ).resolves.toMatchObject({ outcome: "recovered-ready", status: "ready" });
  });

  it("fails unresolved when neither proposal nor preapproval exists", async () => {
    const setup = fixture();

    await expect(
      recoverFiveNorthPreapproval({
        readStateContracts: vi.fn(async () => setup.absent),
        request: setup.request,
      }),
    ).rejects.toThrow("unresolved");
  });

  it("fails closed when one snapshot contains both pending and ready state", async () => {
    const setup = fixture();
    const mixed = {
      activeAtOffset: 42,
      contracts: [...setup.pending.contracts, ...setup.ready.contracts],
    };
    const submit = vi.fn();

    await expect(
      runFiveNorthPreapproval({
        persistIntent: vi.fn(),
        persistSubmissionStarted: vi.fn(),
        readStateContracts: vi.fn(async () => mixed),
        request: setup.request,
        submit,
      }),
    ).rejects.toThrow("duplicate authority");
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a post-submit snapshot whose offset moved backwards", async () => {
    const setup = fixture();
    const submit = vi.fn(async () => setup.response);
    const readStateContracts = vi
      .fn()
      .mockResolvedValueOnce(setup.absent)
      .mockResolvedValueOnce({ ...setup.pending, activeAtOffset: 41 });

    await expect(
      runFiveNorthPreapproval({
        persistIntent: vi.fn(),
        persistSubmissionStarted: vi.fn(),
        readStateContracts,
        request: setup.request,
        submit,
      }),
    ).rejects.toThrow("offset moved backwards");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
