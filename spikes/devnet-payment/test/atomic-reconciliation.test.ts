import { describe, expect, it } from "vitest";
import { atomicPurchaseCommandId } from "../src/atomic-purchase.js";
import {
  reconcileAtomicPurchaseTransaction,
  type AtomicReconciliationExpectation,
} from "../src/atomic-reconciliation.js";

const proof = {
  attemptId: `sha256:${"a".repeat(64)}`,
  requestCommitment: `sha256:${"b".repeat(64)}`,
  updateId: `1220${"c".repeat(64)}`,
} as const;
const expected = {
  agentParty: "sotto-policy-agent::1220participant",
  amount: "0.2500000000",
  dsoParty: "DSO::1220dso",
  ownerParty: "sotto-policy-owner::1220participant",
  payerParty: "sotto-spike-payer::1220participant",
  policyCid: "policy-cid",
  policyRevision: "0",
  providerParty: "sotto-spike-provider::1220participant",
  remainingLimit: "0.7500000000",
  resourceHash: `sha256:${"d".repeat(64)}`,
  synchronizerId: "global-domain::1220sync",
} as const satisfies AtomicReconciliationExpectation;

const transfer = {
  choice: "AmuletRules_Transfer",
  choiceArgument: {
    expectedDso: expected.dsoParty,
    transfer: {
      inputs: [{ tag: "InputAmulet", value: "payer-holding-cid" }],
      outputs: [
        {
          amount: expected.amount,
          receiver: expected.providerParty,
          receiverFeeRatio: "0.0000000000",
        },
      ],
      provider: expected.providerParty,
      sender: expected.payerParty,
    },
  },
  exerciseResult: {
    createdAmulets: [
      { tag: "TransferResultAmulet", value: "provider-holding-cid" },
    ],
  },
};
const consume = {
  choice: "Consume",
  choiceArgument: {
    amount: expected.amount,
    attemptId: proof.attemptId,
    recipient: expected.providerParty,
    requestCommitment: proof.requestCommitment,
    resourceHash: expected.resourceHash,
  },
  contractId: expected.policyCid,
};
const context = {
  createArgument: {
    agent: expected.agentParty,
    amount: expected.amount,
    attemptId: proof.attemptId,
    owner: expected.ownerParty,
    payer: expected.payerParty,
    policyRevision: expected.policyRevision,
    provider: expected.providerParty,
    requestCommitment: proof.requestCommitment,
    resourceHash: expected.resourceHash,
  },
  packageName: "sotto-control",
  templateId: "package:Sotto.Control.PrivacyProbe:PurchaseContextProbe",
};
const reducedPolicy = {
  createArgument: {
    agent: expected.agentParty,
    allowedRecipient: expected.providerParty,
    allowedResourceHash: expected.resourceHash,
    owner: expected.ownerParty,
    payer: expected.payerParty,
    remainingLimit: expected.remainingLimit,
    revision: "1",
    usedAttemptIds: [proof.attemptId],
  },
  packageName: "sotto-control",
  templateId: "package:Sotto.Control.PrivacyProbe:PurchasePolicyProbe",
};

function transaction(events: unknown[]) {
  return {
    transaction: {
      commandId: atomicPurchaseCommandId(proof),
      events,
      synchronizerId: expected.synchronizerId,
      updateId: proof.updateId,
    },
  };
}

const exactEvents = [
  { ExercisedEvent: consume },
  { CreatedEvent: context },
  { CreatedEvent: reducedPolicy },
  { ExercisedEvent: transfer },
];

describe("reconcileAtomicPurchaseTransaction", () => {
  it("accepts policy, private context, and payment in one update", () => {
    expect(
      reconcileAtomicPurchaseTransaction(
        transaction(exactEvents),
        proof,
        expected,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "context",
      exactEvents.filter(
        (event) => !("CreatedEvent" in event && event.CreatedEvent === context),
      ),
    ],
    [
      "policy",
      exactEvents.filter(
        (event) =>
          !("ExercisedEvent" in event && event.ExercisedEvent === consume),
      ),
    ],
    [
      "payment",
      exactEvents.filter(
        (event) =>
          !("ExercisedEvent" in event && event.ExercisedEvent === transfer),
      ),
    ],
  ])("rejects a transaction missing the %s effect", (_name, events) => {
    expect(
      reconcileAtomicPurchaseTransaction(transaction(events), proof, expected),
    ).toBe(false);
  });
});
