import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  evaluateReconciliationMutations,
  reconcileSettlementTransaction,
  type ReconciliationExpectation,
} from "../src/reconciliation.js";

const proof = {
  attemptId: `sha256:${"a".repeat(64)}`,
  requestCommitment: `sha256:${"b".repeat(64)}`,
  updateId: `1220${"c".repeat(64)}`,
} as const;
const expected = {
  amount: "0.2500000000",
  dsoParty: "DSO::1220dso",
  payerParty: "sotto-spike-payer::1220participant",
  providerParty: "sotto-spike-provider::1220participant",
  synchronizerId: "global-domain::1220sync",
} as const satisfies ReconciliationExpectation;

function commandId(value: typeof proof): string {
  return `sotto-settle-${createHash("sha256")
    .update(
      JSON.stringify({
        version: "sotto-settlement-command-v1",
        attemptId: value.attemptId,
        requestCommitment: value.requestCommitment,
      }),
    )
    .digest("hex")}`;
}

const transferEvent = {
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

function transaction(event: unknown = transferEvent) {
  return {
    transaction: {
      commandId: commandId(proof),
      events: [{ ExercisedEvent: event }],
      synchronizerId: expected.synchronizerId,
      updateId: proof.updateId,
    },
  };
}

describe("reconcileSettlementTransaction", () => {
  it("accepts one exact ledger transfer rooted in the purchase commitment", () => {
    expect(reconcileSettlementTransaction(transaction(), proof, expected)).toBe(
      true,
    );
  });

  it("reports the exact live reconciliation and mutation rejection matrix", () => {
    expect(
      evaluateReconciliationMutations(transaction(), proof, expected),
    ).toEqual({
      exactAccepted: true,
      attemptMutationRejected: true,
      recipientMutationRejected: true,
      requestCommitmentMutationRejected: true,
      updateMutationRejected: true,
    });
  });

  it.each([
    ["update", { updateId: `1220${"d".repeat(64)}` }],
    ["attempt", { attemptId: `sha256:${"d".repeat(64)}` }],
    ["commitment", { requestCommitment: `sha256:${"d".repeat(64)}` }],
  ] as const)("rejects a changed %s proof", (_name, mutation) => {
    expect(
      reconcileSettlementTransaction(
        transaction(),
        { ...proof, ...mutation },
        expected,
      ),
    ).toBe(false);
  });

  it("rejects recipient mutation inside the accepted ledger event", () => {
    const mutated = {
      ...transferEvent,
      choiceArgument: {
        ...transferEvent.choiceArgument,
        transfer: {
          ...transferEvent.choiceArgument.transfer,
          outputs: [
            {
              ...transferEvent.choiceArgument.transfer.outputs[0],
              receiver: "attacker::1220bad",
            },
          ],
        },
      },
    };

    expect(
      reconcileSettlementTransaction(transaction(mutated), proof, expected),
    ).toBe(false);
  });
});
