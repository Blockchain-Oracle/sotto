import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
  MAX_PREPARE_RESPONSE_BYTES,
  PREPARE_SUBMISSION_PATH,
  PREPARE_SUBMISSION_TIMEOUT_MS,
} from "../src/index.js";
import { preparedPurchaseBytes } from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");
const validCostEstimation = {
  estimationTimestamp: "2026-07-13T10:00:02Z",
  confirmationRequestTrafficCostEstimation: 1,
  confirmationResponseTrafficCostEstimation: 2,
  totalTrafficCostEstimation: 3,
};

function response(
  transactionBytes: Uint8Array,
  overrides: Record<string, unknown> = {},
  includeOptionalFields = true,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transactionBytes).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      ...(includeOptionalFields
        ? { hashingDetails: null, costEstimation: null }
        : {}),
      ...overrides,
    }),
  );
}

describe("prepared Purchase observation envelope", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one authenticated bounded prepare request and emits redacted evidence", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const reader = vi.fn(async () => response(transaction));
    const observe = createPreparedPurchaseObserver(reader);

    const observation = await observe(prepareRequest);

    expect(reader).toHaveBeenCalledWith({
      path: PREPARE_SUBMISSION_PATH,
      method: "POST",
      contentType: "application/json",
      redirect: "error",
      timeoutMilliseconds: PREPARE_SUBMISSION_TIMEOUT_MS,
      maximumResponseBytes: MAX_PREPARE_RESPONSE_BYTES,
      body: prepareRequest,
    });
    expect(observation).toEqual({
      observationId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      observedAt: "2026-07-13T10:00:02.000Z",
      preparedTransactionHash: preparedHash,
    });
    expect(JSON.stringify(observation)).not.toContain('"preparedTransaction":');
    await expect(observe(prepareRequest)).rejects.toThrow("already claimed");
  });

  it.each([
    ["omits both optional fields", {}, false],
    ["uses null optional fields", {}, true],
    ["includes valid hashing details", { hashingDetails: "v2" }, true],
    [
      "includes a valid cost estimation",
      { costEstimation: validCostEstimation },
      true,
    ],
  ])("accepts a response that %s", async (_name, optional, includeOptional) => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const observe = createPreparedPurchaseObserver(async () =>
      response(transaction, optional, includeOptional),
    );

    await expect(observe(prepareRequest)).resolves.toMatchObject({
      preparedTransactionHash: preparedHash,
    });
  });

  it.each([
    [
      "wrong hashing scheme",
      { hashingSchemeVersion: "HASHING_SCHEME_VERSION_V3" },
    ],
    [
      "short hash",
      { preparedTransactionHash: Buffer.alloc(31).toString("base64") },
    ],
    [
      "multihash instead of raw digest",
      {
        preparedTransactionHash: Buffer.concat([
          Buffer.from([0x12, 0x20]),
          Buffer.alloc(32, 7),
        ]).toString("base64"),
      },
    ],
    ["noncanonical hash", { preparedTransactionHash: `${preparedHash}\n` }],
    ["expanded transaction object", { preparedTransaction: {} }],
    [
      "noncanonical transaction",
      {
        preparedTransaction: `${Buffer.from("prepared-protobuf").toString("base64")}\n`,
      },
    ],
    ["invalid hashing details", { hashingDetails: 7 }],
    ["invalid cost estimation", { costEstimation: {} }],
    ["missing prepared transaction", { preparedTransaction: undefined }],
    ["missing prepared hash", { preparedTransactionHash: undefined }],
    ["missing hashing scheme", { hashingSchemeVersion: undefined }],
    ["unknown field", { unexpected: true }],
  ])("rejects a %s", async (_name, mutation) => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const observe = createPreparedPurchaseObserver(async () =>
      response(transaction, mutation),
    );

    await expect(observe(prepareRequest)).rejects.toThrow();
  });

  it("rejects forged or cloned prepare requests before transport", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const reader = vi.fn(async () => response(transaction));
    const observe = createPreparedPurchaseObserver(reader);

    await expect(observe(structuredClone(prepareRequest))).rejects.toThrow(
      "not authenticated",
    );
    expect(reader).not.toHaveBeenCalled();
  });

  it("rejects a prepare acquisition that exceeds its time budget", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const observe = createPreparedPurchaseObserver(async () => {
      vi.advanceTimersByTime(10_001);
      return response(transaction);
    });

    await expect(observe(prepareRequest)).rejects.toThrow(/stale/i);
  });

  it("rejects a prepare acquisition after its execution window", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const observe = createPreparedPurchaseObserver(async () => {
      vi.setSystemTime(new Date(intent.challenge.executeBefore));
      return response(transaction);
    });

    await expect(observe(prepareRequest)).rejects.toThrow(/execution window/i);
  });

  it("rejects a material clock rollback during preparation", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, prepareRequest);
    const observe = createPreparedPurchaseObserver(async () => {
      vi.setSystemTime(new Date("2026-07-13T09:59:56.999Z"));
      return response(transaction);
    });

    await expect(observe(prepareRequest)).rejects.toThrow(
      /clock moved backwards/i,
    );
  });
});
