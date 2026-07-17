import {
  projectHumanSettlementExpectation,
  type HumanSettlementExpectation,
  verifyHumanPreparedPurchaseHash,
} from "@sotto/x402-canton";
import { humanPreparedHashInputs } from "../../../packages/x402-canton/test/human-prepared-purchase-hash.fixtures.js";
import { registerHumanPreparedPurchaseObservation } from "../../../packages/x402-canton/dist/human-prepared-purchase-observation-state.js";
import type { HumanPurchaseSettlementProof } from "../src/human-purchase-provider-reconciliation.js";

export const HUMAN_SETTLEMENT_UPDATE = `1220${"c".repeat(64)}`;
export const HUMAN_PROVIDER_HOLDING = "00human-provider-holding";

export const HUMAN_SETTLEMENT_MUTATIONS: ReadonlyArray<
  readonly [string, readonly (string | number)[], unknown]
> = [
  ["command", ["transaction", "commandId"], "wrong"],
  ["update", ["transaction", "updateId"], `1220${"d".repeat(64)}`],
  ["synchronizer", ["transaction", "synchronizerId"], "wrong"],
  [
    "payer",
    ["transaction", "events", 0, "ExercisedEvent", "actingParties"],
    ["wrong"],
  ],
  [
    "preapproval",
    ["transaction", "events", 0, "ExercisedEvent", "contractId"],
    "wrong",
  ],
  [
    "package",
    ["transaction", "events", 0, "ExercisedEvent", "templateId"],
    "wrong",
  ],
  [
    "amount",
    ["transaction", "events", 0, "ExercisedEvent", "choiceArgument", "amount"],
    "0.2400000000",
  ],
  [
    "input",
    [
      "transaction",
      "events",
      0,
      "ExercisedEvent",
      "choiceArgument",
      "inputs",
      0,
      "value",
    ],
    "wrong",
  ],
  [
    "context",
    [
      "transaction",
      "events",
      0,
      "ExercisedEvent",
      "choiceArgument",
      "context",
      "featuredAppRight",
    ],
    "wrong",
  ],
  [
    "metadata",
    [
      "transaction",
      "events",
      0,
      "ExercisedEvent",
      "choiceArgument",
      "meta",
      "values",
      "sotto-x402/v1/challenge-id",
    ],
    `sha256:${"f".repeat(64)}`,
  ],
  [
    "holding owner",
    ["transaction", "events", 1, "CreatedEvent", "createArgument", "owner"],
    "wrong",
  ],
  [
    "holding amount",
    [
      "transaction",
      "events",
      1,
      "CreatedEvent",
      "createArgument",
      "amount",
      "initialAmount",
    ],
    "0.2400000000",
  ],
  [
    "holding link",
    [
      "transaction",
      "events",
      0,
      "ExercisedEvent",
      "exerciseResult",
      "result",
      "createdAmulets",
      0,
      "value",
    ],
    "wrong",
  ],
];

export async function humanSettlementFixture(): Promise<{
  expected: HumanSettlementExpectation;
  proof: HumanPurchaseSettlementProof;
  response: ReturnType<typeof humanSettlementTransaction>;
}> {
  const input = await humanPreparedHashInputs();
  const now = Date.now();
  registerHumanPreparedPurchaseObservation(input.observation, {
    acquisitionStartedAt: now,
    capturedAt: now,
    claimed: false,
    intent: input.intent,
    prepareRequest: input.request,
    preparedTransaction: input.transaction,
    participantPreparedTransactionHash: input.digest,
    shape: {} as never,
  });
  const verified = await verifyHumanPreparedPurchaseHash(
    input.observation as unknown as Parameters<
      typeof verifyHumanPreparedPurchaseHash
    >[0],
    { recomputeOfficialHash: async () => input.digest },
  );
  const expected = projectHumanSettlementExpectation(verified);
  const proof = Object.freeze({
    attemptId: expected.attemptId,
    challengeId: expected.challengeId,
    requestCommitment: expected.requestCommitment,
    purchaseCommitment: expected.purchaseCommitment,
    updateId: HUMAN_SETTLEMENT_UPDATE,
  });
  return { expected, proof, response: humanSettlementTransaction(expected) };
}

function sottoMetadata(expected: HumanSettlementExpectation) {
  return {
    "sotto-x402/v1/attempt-id": expected.attemptId,
    "sotto-x402/v1/challenge-id": expected.challengeId,
    "sotto-x402/v1/purchase-commitment": expected.purchaseCommitment,
    "sotto-x402/v1/request-commitment": expected.requestCommitment,
  };
}

export function humanSettlementTransaction(
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
      updateId: HUMAN_SETTLEMENT_UPDATE,
    },
  };
}
