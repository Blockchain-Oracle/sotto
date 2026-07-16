import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanTransferFactoryObservation,
  createHumanTransferFactoryObserver,
  readHumanTransferFactoryObservation,
} from "../src/human-transfer-factory-observation.js";
import { createHumanPurchaseHoldingObserver } from "../src/index.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponse,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";

describe("policy-free human TransferFactory security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("binds the context to the exact intent and holding handle", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const observation = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    const sameValueHoldings = await createHumanPurchaseHoldingObserver(
      humanHoldingReader([
        humanHoldingEntry("00human-b", "0.1500000000"),
        humanHoldingEntry("00human-a", "0.2000000000"),
      ]),
    )(intent);
    const otherIntent = await authenticatedHumanPurchaseIntent();

    expect(() =>
      readHumanTransferFactoryObservation(
        structuredClone(observation),
        intent,
        holdings,
      ),
    ).toThrow(/not authenticated/iu);
    expect(() =>
      readHumanTransferFactoryObservation(
        observation,
        intent,
        sameValueHoldings,
      ),
    ).toThrow(/other holdings/iu);
    expect(() =>
      claimHumanTransferFactoryObservation(observation, otherIntent, holdings),
    ).toThrow();
    expect(
      claimHumanTransferFactoryObservation(observation, intent, holdings)
        .factoryId,
    ).toBe(intent.tokenFactory.contractId);
    expect(() =>
      readHumanTransferFactoryObservation(observation, intent, holdings),
    ).toThrow(/already claimed/iu);
    expect(() =>
      readHumanPurchaseHoldingObservation(sameValueHoldings, intent),
    ).not.toThrow();
  });

  it("rejects hostile handles without invoking their properties", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    let reads = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          reads += 1;
          throw new Error("private-registry-getter");
        },
      },
    );

    expect(() =>
      readHumanTransferFactoryObservation(hostile, intent, holdings),
    ).toThrow(/not authenticated/iu);
    expect(reads).toBe(0);
  });

  it.each([
    [
      "duplicate factory disclosures",
      (response: ReturnType<typeof humanTransferFactoryResponse>) => {
        response.choiceContext.disclosedContracts.push(
          structuredClone(response.choiceContext.disclosedContracts[0]!),
        );
      },
    ],
    [
      "wrong factory",
      (response: ReturnType<typeof humanTransferFactoryResponse>) => {
        response.factoryId = "00wrong-factory";
      },
    ],
    [
      "wrong transfer kind",
      (response: ReturnType<typeof humanTransferFactoryResponse>) => {
        response.transferKind = "pending";
      },
    ],
    [
      "wrong disclosure template",
      (response: ReturnType<typeof humanTransferFactoryResponse>) => {
        Reflect.set(
          response.choiceContext.disclosedContracts[0]!,
          "templateId",
          `${"f".repeat(64)}:Wrong:Factory`,
        );
      },
    ],
    [
      "wrong disclosure synchronizer",
      (response: ReturnType<typeof humanTransferFactoryResponse>) => {
        response.choiceContext.disclosedContracts[0]!.synchronizerId =
          "wrong::synchronizer";
      },
    ],
  ])("rejects %s without consuming holdings", async (_name, mutate) => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const response = humanTransferFactoryResponse(intent);
    mutate(response);

    await expect(
      createHumanTransferFactoryObserver(async () =>
        new TextEncoder().encode(JSON.stringify(response)),
      )(intent, holdings),
    ).rejects.toThrow();
    expect(() =>
      readHumanPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
  });

  it("accepts a factory resolved from the participant local store", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const response = humanTransferFactoryResponse(intent);
    response.choiceContext.disclosedContracts = [];

    const observation = await createHumanTransferFactoryObserver(async () =>
      new TextEncoder().encode(JSON.stringify(response)),
    )(intent, holdings);

    expect(
      readHumanTransferFactoryObservation(observation, intent, holdings)
        .disclosedContracts,
    ).toEqual([]);
    expect(() =>
      readHumanPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
  });

  it("redacts upstream failures and attacker-controlled duplicate keys", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    await expect(
      createHumanTransferFactoryObserver(async () => {
        throw new Error("token=private-upstream-secret");
      })(intent, holdings),
    ).rejects.toEqual(new Error("human TransferFactory registry read failed"));

    const secret = "private-duplicate-key-secret";
    const source = JSON.stringify(humanTransferFactoryResponse(intent));
    const duplicate = source.replace(
      '"factoryId":',
      `"${secret}":null,"${secret}":null,"factoryId":`,
    );
    try {
      await createHumanTransferFactoryObserver(async () =>
        new TextEncoder().encode(duplicate),
      )(intent, holdings);
      throw new Error("duplicate response was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/duplicate JSON key/iu);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
