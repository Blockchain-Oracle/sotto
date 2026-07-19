import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanPurchaseHoldingObserver } from "../src/index.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { buildHumanTransferFactoryChoiceArguments } from "../src/human-transfer-factory-choice.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";

describe("policy-free human TransferFactory choice", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("builds one direct payer transfer with only hash-safe metadata", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const observation = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([
        humanHoldingEntry("00human-b", "0.1500000000"),
        humanHoldingEntry("00human-a", "0.2000000000"),
      ]),
    )(intent);
    const holdings = readHumanPurchaseHoldingObservation(observation, intent);

    const choice = buildHumanTransferFactoryChoiceArguments(intent, holdings);

    expect(choice).toEqual({
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
            "sotto-x402/v1/purchase-commitment": intent.purchaseCommitment,
            "sotto-x402/v1/request-commitment":
              intent.request.requestCommitment,
          },
        },
      },
      extraArgs: { context: { values: {} }, meta: { values: {} } },
    });
    expect(Object.keys(choice.transfer.meta.values)).toEqual([
      "sotto-x402/v1/attempt-id",
      "sotto-x402/v1/challenge-id",
      "sotto-x402/v1/purchase-commitment",
      "sotto-x402/v1/request-commitment",
    ]);
    expect(JSON.stringify(choice)).not.toMatch(
      /authorizationMode|actAs|capability|agent/iu,
    );
    expect(Object.isFrozen(choice)).toBe(true);
    expect(Object.isFrozen(choice.transfer.meta.values)).toBe(true);
  });
});
