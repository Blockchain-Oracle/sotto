import { describe, expect, it } from "vitest";
import {
  buildFiveNorthPreapprovalProposal,
  parseFiveNorthPreapprovalProposalResponse,
  reconcileFiveNorthPreapprovalProposalAcs,
  TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
} from "../src/five-north-preapproval-proposal.js";

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
    contractId: "00preapprovalproposal",
    createArgument: create.createArguments,
    observers: [input.validatorParty],
    packageName: "splice-wallet",
    representativePackageId: input.packageId,
    signatories: [input.receiverParty],
    templateId: TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
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
    event,
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

describe("Five North transfer preapproval proposal", () => {
  it("builds one receiver-authorized, package-pinned proposal", () => {
    const request = buildFiveNorthPreapprovalProposal(input);

    expect(request).toMatchObject({
      actAs: [input.receiverParty],
      readAs: [],
      userId: input.userId,
      workflowId: "sotto-transfer-preapproval-bootstrap-v1",
      synchronizerId: input.synchronizerId,
      packageIdSelectionPreference: [input.packageId],
      commands: [
        {
          CreateCommand: {
            templateId: TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
            createArguments: {
              receiver: input.receiverParty,
              provider: input.validatorParty,
              expectedDso: input.expectedDso,
            },
          },
        },
      ],
    });
    expect(request.commandId).toMatch(
      /^sotto-transfer-preapproval-proposal-v1-[0-9a-f]{64}$/u,
    );
    expect(buildFiveNorthPreapprovalProposal(input).commandId).toBe(
      request.commandId,
    );
  });

  it.each([
    ["receiverParty", `other-provider::1220${"1".repeat(64)}`],
    ["validatorParty", "invalid"],
    ["expectedDso", "invalid"],
    ["packageId", "not-a-package"],
    ["synchronizerId", "invalid"],
    ["userId", ""],
  ] as const)("rejects an invalid %s", (field, value) => {
    expect(() =>
      buildFiveNorthPreapprovalProposal({ ...input, [field]: value }),
    ).toThrow();
  });

  it("parses only the exact created proposal transaction", () => {
    const setup = fixture();

    expect(
      parseFiveNorthPreapprovalProposalResponse(setup.response, setup.request),
    ).toEqual({
      commandId: setup.request.commandId,
      contractId: setup.event.contractId,
      offset: 42,
      updateId,
    });
  });

  it.each([
    ["provider", `other-validator::1220${"2".repeat(64)}`],
    ["receiver", `sotto-other-provider::1220${"1".repeat(64)}`],
    ["expectedDso", `OtherDSO::1220${"3".repeat(64)}`],
  ] as const)("rejects a mutated %s in the created event", (field, value) => {
    const setup = fixture();
    const response = structuredClone(setup.response);
    const event = response.transaction.events[0]!.CreatedEvent;
    event.createArgument = { ...event.createArgument, [field]: value };

    expect(() =>
      parseFiveNorthPreapprovalProposalResponse(response, setup.request),
    ).toThrow("does not match");
  });

  it("reconciles exactly one matching active proposal", () => {
    const setup = fixture();

    expect(
      reconcileFiveNorthPreapprovalProposalAcs([setup.active], setup.request),
    ).toEqual({
      activeCount: 1,
      matchingContractIds: [setup.event.contractId],
    });
    expect(reconcileFiveNorthPreapprovalProposalAcs([], setup.request)).toEqual(
      { activeCount: 0, matchingContractIds: [] },
    );
  });

  it("rejects a proposal active on another synchronizer", () => {
    const setup = fixture();
    const active = {
      contractEntry: {
        JsActiveContract: {
          ...structuredClone(setup.active.contractEntry.JsActiveContract),
          synchronizerId: `other-domain::1220${"5".repeat(64)}`,
        },
      },
    };

    expect(
      reconcileFiveNorthPreapprovalProposalAcs([active], setup.request),
    ).toEqual({ activeCount: 1, matchingContractIds: [] });
  });

  it("rejects a submitted proposal from another synchronizer", () => {
    const setup = fixture();
    const response = {
      transaction: {
        ...structuredClone(setup.response.transaction),
        synchronizerId: `other-domain::1220${"5".repeat(64)}`,
      },
    };

    expect(() =>
      parseFiveNorthPreapprovalProposalResponse(response, setup.request),
    ).toThrow("does not match");
  });
});
