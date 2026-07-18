import {
  projectHumanSettlementExpectation,
  verifyHumanPreparedPurchaseHash,
  type HumanPurchaseSettlementProof,
  type HumanSettlementExpectation,
} from "../src/index.js";
import { humanPreparedHashInputs } from "./human-prepared-purchase-hash.fixtures.js";

export const HUMAN_PROVIDER_SETTLEMENT_UPDATE = `1220${"c".repeat(64)}`;
export const HUMAN_PROVIDER_HOLDING = "00human-provider-holding";

function sottoMetadata(expected: HumanSettlementExpectation) {
  return {
    "sotto-x402/v1/attempt-id": expected.attemptId,
    "sotto-x402/v1/challenge-id": expected.challengeId,
    "sotto-x402/v1/purchase-commitment": expected.purchaseCommitment,
    "sotto-x402/v1/request-commitment": expected.requestCommitment,
  };
}

export function humanProviderSettlementTransaction(
  expected: HumanSettlementExpectation,
) {
  return {
    transaction: {
      commandId: expected.commandId,
      events: [
        {
          ExercisedEvent: {
            actingParties: [expected.payerParty],
            choice: "TransferPreapproval_SendV2",
            choiceArgument: {
              amount: expected.amount,
              context: {
                externalPartyConfigState:
                  expected.choiceContextContractIds[
                    "external-party-config-state"
                  ],
                featuredAppRight:
                  expected.choiceContextContractIds["featured-app-right"],
              },
              description: null,
              inputs: expected.inputHoldingContractIds.map((value) => ({
                tag: "InputAmulet",
                value,
              })),
              meta: { values: sottoMetadata(expected) },
              sender: expected.payerParty,
            },
            consuming: false,
            contractId: expected.transferPreapprovalContractId,
            exerciseResult: {
              result: {
                createdAmulets: [
                  {
                    tag: "TransferResultAmulet",
                    value: HUMAN_PROVIDER_HOLDING,
                  },
                ],
              },
              meta: {
                values: {
                  "splice.lfdecentralizedtrust.org/sender": expected.payerParty,
                  "splice.lfdecentralizedtrust.org/tx-kind": "transfer",
                  ...sottoMetadata(expected),
                },
              },
            },
            templateId: expected.transferPreapprovalTemplateId,
          },
        },
        {
          CreatedEvent: {
            contractId: HUMAN_PROVIDER_HOLDING,
            createArgument: {
              amount: {
                createdAt: { number: "5" },
                initialAmount: expected.amount,
                ratePerRound: { rate: "0.0001000000" },
              },
              dso: expected.dsoParty,
              owner: expected.providerParty,
            },
            templateId: expected.amuletTemplateId,
          },
        },
      ],
      offset: 42,
      synchronizerId: expected.synchronizerId,
      updateId: HUMAN_PROVIDER_SETTLEMENT_UPDATE,
    },
  };
}

export async function humanProviderSettlementFixture(): Promise<{
  expected: HumanSettlementExpectation;
  proof: HumanPurchaseSettlementProof;
  response: ReturnType<typeof humanProviderSettlementTransaction>;
}> {
  const input = await humanPreparedHashInputs();
  const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
    recomputeOfficialHash: async () => input.digest,
  });
  const expected = projectHumanSettlementExpectation(verified);
  const proof = Object.freeze({
    attemptId: expected.attemptId,
    challengeId: expected.challengeId,
    requestCommitment: expected.requestCommitment,
    purchaseCommitment: expected.purchaseCommitment,
    updateId: HUMAN_PROVIDER_SETTLEMENT_UPDATE,
  });
  return {
    expected,
    proof,
    response: humanProviderSettlementTransaction(expected),
  };
}

export function child(value: unknown, key: string | number): unknown {
  if (typeof key === "number") {
    if (!Array.isArray(value)) throw new Error("test path is not an array");
    return value[key];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("test path is not an object");
  }
  return (value as Record<string, unknown>)[key];
}

export function setSettlementValue(
  value: unknown,
  path: readonly (string | number)[],
  replacement: unknown,
): void {
  const key = path.at(-1);
  if (key === undefined) throw new Error("test mutation path is empty");
  let parent = value;
  for (const entry of path.slice(0, -1)) parent = child(parent, entry);
  if (typeof key === "number") {
    if (!Array.isArray(parent)) throw new Error("test parent is not an array");
    parent[key] = replacement;
    return;
  }
  if (typeof parent !== "object" || parent === null || Array.isArray(parent)) {
    throw new Error("test parent is not an object");
  }
  (parent as Record<string, unknown>)[key] = replacement;
}
