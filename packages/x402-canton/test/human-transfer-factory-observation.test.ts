import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimHumanTransferFactoryObservation,
  readHumanTransferFactoryObservation,
} from "../src/human-transfer-factory-observation.js";
import {
  createHumanTransferFactoryObserver,
  type HumanTransferFactoryRegistryReader,
} from "../src/index.js";
import { buildHumanTransferFactoryChoiceArguments } from "../src/human-transfer-factory-choice.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";

describe("policy-free human TransferFactory observation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("acquires one exact direct-transfer context without consuming holdings", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const reader = vi.fn<HumanTransferFactoryRegistryReader>(async () =>
      humanTransferFactoryResponseBytes(intent),
    );

    const observation = await createHumanTransferFactoryObserver(reader)(
      intent,
      holdings,
    );

    expect(reader).toHaveBeenCalledOnce();
    const [request, options] = reader.mock.calls[0]!;
    const holdingMaterial = readHumanPurchaseHoldingObservation(
      holdings,
      intent,
    );
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(request).toEqual({
      registryAdmin: intent.challenge.instrument.admin,
      path: "/registry/transfer-instruction/v1/transfer-factory",
      method: "POST",
      contentType: "application/json",
      redirect: "error",
      timeoutMilliseconds: 10_000,
      maximumResponseBytes: 2_000_000,
      body: JSON.stringify({
        choiceArguments: buildHumanTransferFactoryChoiceArguments(
          intent,
          holdingMaterial,
        ),
        excludeDebugFields: true,
      }),
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.keys(observation).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(JSON.stringify(observation)).not.toContain(
      intent.challenge.payerParty,
    );

    const material = readHumanTransferFactoryObservation(
      observation,
      intent,
      holdings,
    );
    expect(material).toMatchObject({
      factoryId: intent.tokenFactory.contractId,
      transferKind: "direct",
    });
    expect(Object.isFrozen(material)).toBe(true);
    expect(Object.isFrozen(material.choiceContextData)).toBe(true);

    claimHumanTransferFactoryObservation(observation, intent, holdings);
    expect(() =>
      readHumanTransferFactoryObservation(observation, intent, holdings),
    ).toThrow(/already claimed/iu);
  });
});
