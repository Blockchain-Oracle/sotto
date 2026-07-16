import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_REGISTRY_RESPONSE_BYTES,
  TRANSFER_FACTORY_REGISTRY_PATH,
  createTransferFactoryObserver,
  type TransferFactoryRegistryRequest,
} from "../src/index.js";
import {
  claimTransferFactoryObservation,
  readTransferFactoryObservation,
} from "../src/transfer-factory-observation.js";
import {
  factoryResponse,
  purchaseExecutionInputs,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

describe("TransferFactory observation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives the exact bounded registry request from authenticated inputs", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const reader = vi.fn(async (request: TransferFactoryRegistryRequest) => {
      void request;
      return responseBytes(factoryResponse(intent));
    });

    const observation = await createTransferFactoryObserver(reader)(
      intent,
      holdings,
    );

    const request = reader.mock.calls[0]![0];
    expect({ ...request, body: JSON.parse(request.body) }).toEqual({
      registryAdmin: intent.challenge.instrument.admin,
      path: TRANSFER_FACTORY_REGISTRY_PATH,
      method: "POST",
      contentType: "application/json",
      redirect: "error",
      timeoutMilliseconds: 10_000,
      maximumResponseBytes: MAX_REGISTRY_RESPONSE_BYTES,
      body: {
        choiceArguments: {
          expectedAdmin: intent.tokenFactory.expectedAdmin,
          transfer: {
            sender: intent.challenge.payerParty,
            receiver: intent.challenge.recipientParty,
            amount: "0.2500000000",
            instrumentId: intent.challenge.instrument,
            requestedAt: intent.challenge.requestedAt,
            executeBefore: intent.challenge.executeBefore,
            inputHoldingCids: ["00holding-a"],
            meta: { values: {} },
          },
          extraArgs: {
            context: { values: {} },
            meta: { values: {} },
          },
        },
        excludeDebugFields: true,
      },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.keys(observation).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(JSON.stringify(observation)).not.toContain("00holding");
    expect(JSON.stringify(observation)).not.toContain("00round");
  });

  it("accepts the pinned nested direct response and exposes only defensive internals", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const observation = await createTransferFactoryObserver(async () =>
      responseBytes(factoryResponse(intent)),
    )(intent, holdings);

    const material = readTransferFactoryObservation(
      observation,
      intent,
      holdings,
    );
    expect(material.choiceContextData).toEqual({
      values: {
        "splice.example/round": { tag: "AV_ContractId", value: "00round" },
      },
    });
    expect(material.disclosedContracts).toHaveLength(1);
    expect(Object.isFrozen(material)).toBe(true);
    expect(Object.isFrozen(material.choiceContextData)).toBe(true);
    expect(Object.isFrozen(material.disclosedContracts)).toBe(true);
  });

  it("rejects structural clones before contacting the registry", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const reader = vi.fn(async (request: TransferFactoryRegistryRequest) => {
      void request;
      return responseBytes(factoryResponse(intent));
    });
    const observe = createTransferFactoryObserver(reader);

    await expect(observe(structuredClone(intent), holdings)).rejects.toThrow(
      "not authenticated",
    );
    await expect(observe(intent, { ...holdings })).rejects.toThrow(
      "not authenticated",
    );
    expect(reader).not.toHaveBeenCalled();
  });

  it("binds the context to the exact authenticated holding observation", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const observation = await createTransferFactoryObserver(async () =>
      responseBytes(factoryResponse(intent)),
    )(intent, holdings);
    const other = await purchaseExecutionInputs("00holding-b");

    expect(() =>
      readTransferFactoryObservation(observation, intent, other.holdings),
    ).toThrow("holding selection");
  });

  it("claims a fresh registry observation exactly once", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const observation = await createTransferFactoryObserver(async () =>
      responseBytes(factoryResponse(intent)),
    )(intent, holdings);

    expect(
      claimTransferFactoryObservation(observation, intent, holdings)
        .choiceContextData,
    ).toBeDefined();
    expect(() =>
      claimTransferFactoryObservation(observation, intent, holdings),
    ).toThrow("already claimed");
    expect(() =>
      readTransferFactoryObservation(observation, intent, holdings),
    ).toThrow("already claimed");
  });
});
