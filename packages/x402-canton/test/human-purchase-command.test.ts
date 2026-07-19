import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanTransferFactoryObserver } from "../src/index.js";
import { buildHumanPurchasePrepareRequest } from "../src/human-purchase-command.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";

describe("policy-free human purchase command", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("builds exactly one payer-authorized direct Token transfer", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);

    const request = buildHumanPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );

    expect(request).toMatchObject({
      commandId: `sotto-human-purchase-v1-${intent.purchaseCommitment.slice(7)}`,
      actAs: [intent.challenge.payerParty],
      readAs: [],
      synchronizerId: intent.challenge.synchronizerId,
      packageIdSelectionPreference: intent.packageSelection.packageIds,
      verboseHashing: false,
      prefetchContractKeys: [],
      maxRecordTime: intent.challenge.executeBefore,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      commands: [
        {
          ExerciseCommand: {
            templateId: intent.tokenFactory.interfaceId,
            contractId: intent.tokenFactory.contractId,
            choice: "TransferFactory_Transfer",
            choiceArgument: {
              expectedAdmin: intent.tokenFactory.expectedAdmin,
              transfer: {
                sender: intent.challenge.payerParty,
                receiver: intent.challenge.recipientParty,
                amount: "0.2500000000",
                instrumentId: intent.challenge.instrument,
                requestedAt: intent.challenge.requestedAt,
                executeBefore: intent.challenge.executeBefore,
                inputHoldingCids: ["00human-a", "00human-b"],
                meta: {
                  values: {
                    "sotto-x402/v1/attempt-id": intent.attemptId,
                    "sotto-x402/v1/challenge-id": intent.challenge.challengeId,
                    "sotto-x402/v1/purchase-commitment":
                      intent.purchaseCommitment,
                    "sotto-x402/v1/request-commitment":
                      intent.request.requestCommitment,
                  },
                },
              },
              extraArgs: {
                context: {
                  values: {
                    "splice.example/round": {
                      tag: "AV_ContractId",
                      value: "00human-round",
                    },
                  },
                },
                meta: { values: {} },
              },
            },
          },
        },
      ],
    });
    expect(
      request.disclosedContracts.map(({ contractId }) => contractId),
    ).toEqual(["00human-a", "00human-b", intent.tokenFactory.contractId]);
    expect(Object.keys(request).sort()).toEqual([
      "actAs",
      "commandId",
      "commands",
      "disclosedContracts",
      "hashingSchemeVersion",
      "maxRecordTime",
      "packageIdSelectionPreference",
      "prefetchContractKeys",
      "readAs",
      "synchronizerId",
      "verboseHashing",
    ]);
    expect(JSON.stringify(request)).not.toMatch(
      /capability|allowance|policy|PurchaseContext|agent|publicKey|subjectHash|topologyHash|bodyHash/iu,
    );
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.commands)).toBe(true);
    expect(
      Object.isFrozen(request.commands[0]!.ExerciseCommand.choiceArgument),
    ).toBe(true);
    expect(
      Object.isFrozen(
        request.commands[0]!.ExerciseCommand.choiceArgument.extraArgs.context,
      ),
    ).toBe(true);
  });
});
