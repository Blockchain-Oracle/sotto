import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransferFactoryObserver } from "../src/index.js";
import { readTransferFactoryObservation } from "../src/transfer-factory-observation.js";
import {
  factoryDisclosure,
  factoryResponse,
  purchaseExecutionInputs,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

describe("TransferFactory response validation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["direct", { transferKind: "self" }],
    ["direct", { transferKind: "offer" }],
    ["direct", { transferKind: "unknown" }],
    ["factoryId", { factoryId: "00wrong-factory" }],
    ["keys", { debugPayload: { secret: "must-not-pass" } }],
    [
      "keys",
      {
        choiceContext: {
          choiceContextData: { values: {} },
          disclosedContracts: [],
          debugCreatedAt: "2026-07-13T10:00:00Z",
        },
      },
    ],
    [
      "values",
      {
        choiceContext: {
          choiceContextData: { values: "not-an-object" },
          disclosedContracts: [],
        },
      },
    ],
  ])("rejects invalid response %s", async (expected, overrides) => {
    const { intent, holdings } = await purchaseExecutionInputs();
    await expect(
      createTransferFactoryObserver(async () =>
        responseBytes(factoryResponse(intent, overrides)),
      )(intent, holdings),
    ).rejects.toThrow(expected);
  });

  it.each([
    ["synchronizer", { synchronizerId: "other-domain::1220sync" }],
    ["templateId", { templateId: "not-a-template-id" }],
    ["creation template", { templateId: "0".repeat(64) + ":Bad:Factory" }],
    ["base64", { createdEventBlob: "not base64!" }],
  ])("rejects invalid disclosure %s", async (expected, mutation) => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const disclosure = { ...factoryDisclosure(intent), ...mutation };
    await expect(
      createTransferFactoryObserver(async () =>
        responseBytes(
          factoryResponse(intent, {
            choiceContext: {
              choiceContextData: { values: {} },
              disclosedContracts: [disclosure],
            },
          }),
        ),
      )(intent, holdings),
    ).rejects.toThrow(expected);
  });

  it("rejects duplicate and excessive disclosures", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const disclosure = factoryDisclosure(intent);
    const observe = (disclosures: unknown[]) =>
      createTransferFactoryObserver(async () =>
        responseBytes(
          factoryResponse(intent, {
            choiceContext: {
              choiceContextData: { values: {} },
              disclosedContracts: disclosures,
            },
          }),
        ),
      )(intent, holdings);

    await expect(observe([disclosure, disclosure])).rejects.toThrow(
      "duplicated",
    );
    await expect(
      observe(
        Array.from({ length: 17 }, (_, index) => ({
          ...disclosure,
          contractId: `00disclosure-${index}`,
        })),
      ),
    ).rejects.toThrow("count limit");
  });

  it("accepts the official zero-disclosure response", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const observation = await createTransferFactoryObserver(async () =>
      responseBytes(
        factoryResponse(intent, {
          choiceContext: {
            choiceContextData: { values: {} },
            disclosedContracts: [],
          },
        }),
      ),
    )(intent, holdings);

    expect(
      readTransferFactoryObservation(observation, intent, holdings)
        .disclosedContracts,
    ).toEqual([]);
  });

  it.each([
    ["BOM", Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])],
    ["UTF-8", Uint8Array.from([0xff])],
    [
      "duplicate JSON key",
      new TextEncoder().encode(
        '{"factoryId":"a","factoryId":"b","transferKind":"direct","choiceContext":{}}',
      ),
    ],
    ["byte limit", new Uint8Array(2_000_001)],
  ])("rejects unsafe raw bytes: %s", async (expected, bytes) => {
    const { intent, holdings } = await purchaseExecutionInputs();
    await expect(
      createTransferFactoryObserver(async () => bytes)(intent, holdings),
    ).rejects.toThrow(expected);
  });

  it("rejects stale acquisition and insufficient execution time", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    await expect(
      createTransferFactoryObserver(async () => {
        vi.advanceTimersByTime(60_001);
        return responseBytes(factoryResponse(intent));
      })(intent, holdings),
    ).rejects.toThrow(/acquisition is stale|execution window/);

    vi.setSystemTime(new Date("2026-07-13T10:00:41.000Z"));
    await expect(
      createTransferFactoryObserver(async () =>
        responseBytes(factoryResponse(intent)),
      )(intent, holdings),
    ).rejects.toThrow("execution window");
  });

  it("snapshots registry bytes before caller mutation", async () => {
    const { intent, holdings } = await purchaseExecutionInputs();
    const bytes = responseBytes(factoryResponse(intent));
    const observation = await createTransferFactoryObserver(async () => bytes)(
      intent,
      holdings,
    );
    bytes.fill(0);

    expect(
      readTransferFactoryObservation(observation, intent, holdings).factoryId,
    ).toBe(intent.tokenFactory.contractId);
  });
});
