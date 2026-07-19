import {
  commitHttpRequest,
  createPaymentAuthorization,
  type CantonPaymentRequirement,
} from "@sotto/x402-canton";
import { describe, expect, it } from "vitest";
import {
  atomicPurchaseCommandId,
  buildAtomicPurchaseRequest,
} from "../src/atomic-purchase.js";

const payer = "sotto-spike-payer::1220participant";
const provider = "sotto-spike-provider::1220participant";
const agent = "sotto-policy-agent::1220participant";
const owner = "sotto-policy-owner::1220participant";
const dso = "DSO::1220dso";
const synchronizer = "global-domain::1220sync";
const policyPackageId = "f".repeat(64);
const policyTemplate = `${policyPackageId}:Sotto.Control.PrivacyProbe:PurchasePolicyProbe`;
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
  authorizationInstanceId: "atomic-authorization-1",
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
      contract_id: "round-cid",
      created_event_blob: "round-blob",
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

function build() {
  return buildAtomicPurchaseRequest({
    amuletRules,
    authorization,
    now: new Date("2026-07-13T08:00:30.000Z"),
    openMiningRounds,
    parties: { agent, owner, payer, provider },
    payerHolding: {
      amount: "10.0000000000",
      contractId: "payer-holding-cid",
      instrumentId: { admin: dso, id: "Amulet" },
      owner: payer,
    },
    policyCid: "policy-cid",
    policyPackageId,
    resourceHash: `sha256:${"a".repeat(64)}`,
    userId: "6",
  });
}

describe("buildAtomicPurchaseRequest", () => {
  it("places policy consumption and payment in one bound command transaction", () => {
    const request = build();

    expect(request.commandId).toBe(atomicPurchaseCommandId(authorization));
    expect(request.actAs).toEqual([agent, payer, provider]);
    expect(request.readAs).toEqual([owner, payer, provider]);
    expect(request.commands).toHaveLength(2);
    expect(request.commands[0]).toMatchObject({
      ExerciseCommand: {
        choice: "Consume",
        choiceArgument: {
          amount: "0.2500000000",
          attemptId: authorization.attemptId,
          recipient: provider,
          requestCommitment: authorization.requestCommitment,
        },
        contractId: "policy-cid",
        templateId: policyTemplate,
      },
    });
    expect(request.commands[1]).toMatchObject({
      ExerciseCommand: {
        choice: "AmuletRules_Transfer",
        choiceArgument: {
          transfer: {
            outputs: [{ amount: "0.2500000000", receiver: provider }],
          },
        },
      },
    });
  });

  it("rejects a policy party mismatch before submission", () => {
    expect(() =>
      buildAtomicPurchaseRequest({
        ...buildInput(),
        parties: { agent, owner, payer: `${payer}-changed`, provider },
      }),
    ).toThrow("parties");
  });
});

function buildInput(): Parameters<typeof buildAtomicPurchaseRequest>[0] {
  return {
    amuletRules,
    authorization,
    now: new Date("2026-07-13T08:00:30.000Z"),
    openMiningRounds,
    parties: { agent, owner, payer, provider },
    payerHolding: {
      amount: "10.0000000000",
      contractId: "payer-holding-cid",
      instrumentId: { admin: dso, id: "Amulet" },
      owner: payer,
    },
    policyCid: "policy-cid",
    policyPackageId,
    resourceHash: `sha256:${"a".repeat(64)}`,
    userId: "6",
  };
}
