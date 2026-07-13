import { describe, expect, it } from "vitest";
import {
  commitHttpRequest,
  createPaymentAuthorization,
  type CantonPaymentRequirement,
} from "@sotto/x402-canton";
import { buildSettlementRequest } from "../src/settlement.js";

const payer = "sotto-spike-payer::1220participant";
const provider = "sotto-spike-provider::1220participant";
const dso = "DSO::1220dso";
const synchronizer = "global-domain::1220sync";
const binding = commitHttpRequest({
  method: "GET",
  url: "https://provider.example/paid/weather",
});
const requirement = {
  amount: "2500000000",
  asset: "CC",
  extra: {
    assetTransferMethod: "amulet-rules-transfer",
    executeBeforeSeconds: 60,
    feePayer: payer,
    instrumentId: { admin: dso, id: "Amulet" },
    synchronizerId: synchronizer,
  },
  maxTimeoutSeconds: 60,
  network: "canton:devnet",
  payTo: provider,
  scheme: "exact",
} as const satisfies CantonPaymentRequirement;
const authorization = createPaymentAuthorization({
  authorizationInstanceId: "authorization-1",
  binding,
  carriedRequestCommitment: binding.commitment,
  observedAt: "2026-07-13T08:00:00.000Z",
  payerParty: payer,
  requirement,
});

const amuletRules = {
  contract: {
    contract_id: "rules-cid",
    created_event_blob: "rules-blob",
    payload: { dso },
    template_id: "rules-package:Splice.AmuletRules:AmuletRules",
  },
  domain_id: synchronizer,
};
const openMiningRounds = [
  {
    contract: {
      contract_id: "round-41-cid",
      created_event_blob: "round-41-blob",
      payload: {
        opensAt: "2026-07-13T07:58:00.000Z",
        round: { number: "41" },
        targetClosesAt: "2026-07-13T08:02:00.000Z",
      },
      template_id: "round-package:Splice.Round:OpenMiningRound",
    },
    domain_id: synchronizer,
  },
  {
    contract: {
      contract_id: "round-42-cid",
      created_event_blob: "round-42-blob",
      payload: {
        opensAt: "2026-07-13T07:59:00.000Z",
        round: { number: "42" },
        targetClosesAt: "2026-07-13T08:03:00.000Z",
      },
      template_id: "round-package:Splice.Round:OpenMiningRound",
    },
    domain_id: synchronizer,
  },
];

describe("buildSettlementRequest", () => {
  it("binds the live Five North transfer to the exact authorized purchase", () => {
    const request = buildSettlementRequest({
      amuletRules,
      authorization,
      now: new Date("2026-07-13T08:00:30.000Z"),
      openMiningRounds,
      payerHolding: {
        amount: "10.0000000000",
        contractId: "payer-holding-cid",
        instrumentId: { admin: dso, id: "Amulet" },
        owner: payer,
      },
      providerParty: provider,
      userId: "6",
    });

    expect(request.actAs).toEqual([payer, provider]);
    expect(request.commandId).toMatch(/^sotto-settle-[0-9a-f]{64}$/);
    expect(request.commandId).not.toBe(
      `sotto-settle-${authorization.attemptId.slice("sha256:".length)}`,
    );
    expect(request.synchronizerId).toBe(synchronizer);
    expect(request.disclosedContracts).toHaveLength(2);
    expect(request.commands[0]).toMatchObject({
      ExerciseCommand: {
        choice: "AmuletRules_Transfer",
        choiceArgument: {
          context: { openMiningRound: "round-42-cid" },
          transfer: {
            inputs: [{ tag: "InputAmulet", value: "payer-holding-cid" }],
            outputs: [
              {
                amount: "0.2500000000",
                receiver: provider,
                receiverFeeRatio: "0.0000000000",
              },
            ],
          },
        },
        contractId: "rules-cid",
      },
    });
  });

  it("rejects an authorization after its execution deadline", () => {
    expect(() =>
      buildSettlementRequest({
        amuletRules,
        authorization,
        now: new Date("2026-07-13T08:01:01.000Z"),
        openMiningRounds,
        payerHolding: {
          amount: "10.0000000000",
          contractId: "payer-holding-cid",
          instrumentId: { admin: dso, id: "Amulet" },
          owner: payer,
        },
        providerParty: provider,
        userId: "6",
      }),
    ).toThrow("expiry");
  });
});
