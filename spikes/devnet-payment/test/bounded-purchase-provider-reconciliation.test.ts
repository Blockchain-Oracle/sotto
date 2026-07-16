import { describe, expect, it } from "vitest";
import { reconcileBoundedPurchaseProviderTransaction } from "../src/bounded-purchase-provider-reconciliation.js";
import {
  expected,
  proof,
  transaction,
} from "./bounded-purchase-provider-reconciliation.fixtures.js";

describe("bounded Purchase provider reconciliation", () => {
  it("accepts one atomically linked provider holding and private context", () => {
    expect(
      reconcileBoundedPurchaseProviderTransaction(
        transaction(),
        proof,
        expected,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "update",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.updateId = `1220${"7".repeat(64)}`;
      },
    ],
    [
      "context request",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[2]!.CreatedEvent!.createArgument.requestCommitment = `sha256:${"8".repeat(64)}`;
      },
    ],
    [
      "holding amount",
      (value: ReturnType<typeof transaction>) => {
        const amount = value.transaction.events[1]!.CreatedEvent!.createArgument
          .amount as { initialAmount: string };
        amount.initialAmount = "0.2490000000";
      },
    ],
    [
      "holding link",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[0]!.ExercisedEvent!.exerciseResult.result.createdAmulets[0]!.value =
          "00different";
      },
    ],
    [
      "transfer contract",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[0]!.ExercisedEvent!.contractId = "00other";
      },
    ],
    [
      "transfer template",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[0]!.ExercisedEvent!.templateId = `${"7".repeat(64)}:Splice.AmuletRules:TransferPreapproval`;
      },
    ],
    [
      "transfer sender",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[0]!.ExercisedEvent!.choiceArgument.sender =
          expected.providerParty;
      },
    ],
    [
      "transfer input",
      (value: ReturnType<typeof transaction>) => {
        const inputs = value.transaction.events[0]!.ExercisedEvent!
          .choiceArgument.inputs as Array<{ tag: string; value: string }>;
        inputs[0]!.value = "00other";
      },
    ],
    [
      "transfer amount",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[0]!.ExercisedEvent!.choiceArgument.amount =
          "0.2490000000";
      },
    ],
    [
      "transfer context",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[0]!.ExercisedEvent!.choiceArgument.context.featuredAppRight =
          "00other";
      },
    ],
    [
      "transfer argument shape",
      (value: ReturnType<typeof transaction>) => {
        const argument = value.transaction.events[0]!.ExercisedEvent!
          .choiceArgument as Record<string, unknown>;
        argument.uncommitted = true;
      },
    ],
    [
      "Amulet package",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[1]!.CreatedEvent!.templateId = `${"0".repeat(64)}:Splice.Amulet:Amulet`;
      },
    ],
    [
      "purchase commitment",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[2]!.CreatedEvent!.createArgument.purchaseCommitment = `sha256:${"0".repeat(64)}`;
      },
    ],
    [
      "challenge",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[2]!.CreatedEvent!.createArgument.challengeId = `sha256:${"0".repeat(64)}`;
      },
    ],
    [
      "capability revision",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[2]!.CreatedEvent!.createArgument.capabilityRevision =
          "1";
      },
    ],
    [
      "agent",
      (value: ReturnType<typeof transaction>) => {
        value.transaction.events[2]!.CreatedEvent!.createArgument.agent = `sotto-attacker::1220${"0".repeat(64)}`;
      },
    ],
  ] as const)("rejects a changed %s", (_name, mutate) => {
    const value = transaction();
    mutate(value);
    expect(
      reconcileBoundedPurchaseProviderTransaction(value, proof, expected),
    ).toBe(false);
  });
});
