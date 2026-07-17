import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
} from "./human-prepared-purchase.fixtures.js";
import { RESOURCE_URL } from "./purchase-commitment.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

async function moduleUnderTest() {
  try {
    return await import("../src/human-prepared-purchase-observation.js");
  } catch (error) {
    throw new Error("HUMAN_PREPARED_OBSERVER_NOT_IMPLEMENTED", {
      cause: error,
    });
  }
}

describe("human prepared Purchase observation", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("is reachable without exposing private claim state", async () => {
    const observer = await moduleUnderTest();
    expect(publicApi.createHumanPreparedPurchaseObserver).toBe(
      observer.createHumanPreparedPurchaseObserver,
    );
    expect(publicApi).not.toHaveProperty(
      "claimHumanPreparedPurchaseObservation",
    );
  });

  it("claims one authenticated request and exposes only redacted identity", async () => {
    const observer = await moduleUnderTest();
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const transaction = humanPreparedPurchaseBytes(intent, request);
    const reader = vi.fn(async (transport, options) => {
      expect(Object.isFrozen(transport)).toBe(true);
      expect(Object.isFrozen(options)).toBe(true);
      return response(transaction);
    });

    const observation =
      await observer.createHumanPreparedPurchaseObserver(reader)(request);

    expect(reader).toHaveBeenCalledWith(
      {
        path: observer.HUMAN_PREPARE_SUBMISSION_PATH,
        method: "POST",
        contentType: "application/json",
        redirect: "error",
        timeoutMilliseconds: observer.HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
        maximumResponseBytes: observer.MAX_PREPARE_RESPONSE_BYTES,
        body: request,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(observation).toEqual({
      version: observer.HUMAN_PREPARED_OBSERVATION_VERSION,
      observationId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      observedAt: HUMAN_PURCHASE_NOW,
    });
    expect(Object.isFrozen(observation)).toBe(true);
    const publicJson = JSON.stringify(observation);
    expect(publicJson).not.toContain("preparedTransaction");
    expect(publicJson).not.toContain(preparedHash);
    expect(publicJson).not.toContain(intent.challenge.payerParty);
    expect(publicJson).not.toContain(intent.challenge.recipientParty);
    expect(publicJson).not.toContain(RESOURCE_URL);
    await expect(
      observer.createHumanPreparedPurchaseObserver(reader)(request),
    ).rejects.toThrow(/already claimed/iu);
    expect(reader).toHaveBeenCalledOnce();
  });
});
