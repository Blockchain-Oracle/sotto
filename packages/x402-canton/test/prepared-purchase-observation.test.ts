import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
  MAX_PREPARE_RESPONSE_BYTES,
  PREPARE_SUBMISSION_PATH,
  PREPARE_SUBMISSION_TIMEOUT_MS,
} from "../src/index.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(overrides: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: {
        transaction: {
          version: "2.1",
          roots: ["0"],
          nodes: [],
          nodeSeeds: [],
        },
        metadata: {},
      },
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
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
    const reader = vi.fn(async () => response());
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
    [
      "wrong hashing scheme",
      { hashingSchemeVersion: "HASHING_SCHEME_VERSION_V3" },
    ],
    [
      "short hash",
      { preparedTransactionHash: Buffer.alloc(31).toString("base64") },
    ],
    ["noncanonical hash", { preparedTransactionHash: `${preparedHash}\n` }],
    ["unknown field", { unexpected: true }],
  ])("rejects a %s", async (_name, mutation) => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const observe = createPreparedPurchaseObserver(async () =>
      response(mutation),
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
    const reader = vi.fn(async () => response());
    const observe = createPreparedPurchaseObserver(reader);

    await expect(observe(structuredClone(prepareRequest))).rejects.toThrow(
      "not authenticated",
    );
    expect(reader).not.toHaveBeenCalled();
  });
});
