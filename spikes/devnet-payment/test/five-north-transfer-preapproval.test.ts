import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseFiveNorthTransferPreapproval,
  reconcileFiveNorthTransferPreapprovalAcs,
  TRANSFER_PREAPPROVAL_TEMPLATE_ID,
} from "../src/five-north-transfer-preapproval.js";

const now = Date.parse("2026-07-13T20:00:00.000Z");
const expected = {
  dso: `DSO::1220${"3".repeat(64)}`,
  provider: `five-north-validator::1220${"2".repeat(64)}`,
  receiver: `sotto-spike-provider::1220${"1".repeat(64)}`,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
} as const;

function fixture() {
  return {
    transfer_preapproval: {
      contract: {
        contract_id: "00transferpreapproval",
        created_at: "2026-07-13T19:59:00.000Z",
        created_event_blob: "opaque-public-contract-blob",
        payload: {
          dso: expected.dso,
          expiresAt: "2026-10-11T20:00:00.000Z",
          lastRenewedAt: "2026-07-13T19:59:00.000Z",
          provider: expected.provider,
          receiver: expected.receiver,
          validFrom: "2026-07-13T19:59:00.000Z",
        },
        template_id: TRANSFER_PREAPPROVAL_TEMPLATE_ID,
      },
      domain_id: expected.synchronizerId,
    },
  };
}

function activeFixture(contractId = "00transferpreapproval") {
  const contract = fixture().transfer_preapproval.contract;
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId,
          createArgument: contract.payload,
          createdAt: "2026-07-13T19:59:00.000Z",
          observers: [],
          packageName: "splice-amulet",
          representativePackageId:
            TRANSFER_PREAPPROVAL_TEMPLATE_ID.split(":")[0],
          signatories: [expected.receiver, expected.provider, expected.dso],
          templateId: "#splice-amulet:Splice.AmuletRules:TransferPreapproval",
        },
        reassignmentCounter: 0,
        synchronizerId: expected.synchronizerId,
      },
    },
  };
}

describe("Five North TransferPreapproval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  it("accepts only the exact future merchant preapproval", () => {
    expect(parseFiveNorthTransferPreapproval(fixture(), expected)).toEqual({
      contractId: "00transferpreapproval",
      expiresAt: "2026-10-11T20:00:00.000Z",
      provider: expected.provider,
      receiver: expected.receiver,
      synchronizerId: expected.synchronizerId,
    });
  });

  it("reconciles the same preapproval from one Ledger ACS snapshot", () => {
    expect(
      reconcileFiveNorthTransferPreapprovalAcs([activeFixture()], expected),
    ).toEqual({
      activeCount: 1,
      matches: [
        {
          contractId: "00transferpreapproval",
          expiresAt: "2026-10-11T20:00:00.000Z",
          provider: expected.provider,
          receiver: expected.receiver,
          synchronizerId: expected.synchronizerId,
        },
      ],
    });
  });

  it("accepts a legitimate renewal contract ID for the same authority tuple", () => {
    const renewed = activeFixture("00renewed-preapproval");
    renewed.contractEntry.JsActiveContract.createdEvent.createArgument.lastRenewedAt =
      "2026-07-13T19:59:30.000Z";

    expect(
      reconcileFiveNorthTransferPreapprovalAcs([renewed], expected),
    ).toMatchObject({
      matches: [{ contractId: "00renewed-preapproval" }],
    });
  });

  it.each([
    ["receiver", `sotto-other::1220${"1".repeat(64)}`],
    ["provider", `other-validator::1220${"2".repeat(64)}`],
    ["dso", `OtherDSO::1220${"3".repeat(64)}`],
  ] as const)("rejects a mismatched %s", (field, value) => {
    const response = fixture();
    const payload = response.transfer_preapproval.contract.payload as Record<
      string,
      string
    >;
    payload[field] = value;

    expect(() => parseFiveNorthTransferPreapproval(response, expected)).toThrow(
      "does not match",
    );
  });

  it.each([
    ["validFrom", "2026-07-13T20:01:00.000Z"],
    ["lastRenewedAt", "2026-07-13T19:58:00.000Z"],
    ["expiresAt", "2026-07-13T20:04:59.999Z"],
  ] as const)("rejects an invalid %s", (field, value) => {
    const response = fixture();
    response.transfer_preapproval.contract.payload[field] = value;

    expect(() => parseFiveNorthTransferPreapproval(response, expected)).toThrow(
      "lifecycle",
    );
  });
});
