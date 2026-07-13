import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
  verifyPreparedPurchaseHash,
} from "../src/index.js";
import { preparedPurchaseBytes } from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const digest = new Uint8Array(32).fill(7);

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: Buffer.from(digest).toString("base64"),
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

async function observation() {
  const { intent, holdings, registry } = await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
  );
  const transaction = preparedPurchaseBytes(intent, request);
  return createPreparedPurchaseObserver(async () => response(transaction))(
    request,
  );
}

describe("prepared Purchase hash gate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires matching precheck, official, and participant digests", async () => {
    const prepared = await observation();
    const precheck = vi.fn(async () => new Uint8Array(digest));
    const official = vi.fn(async () => new Uint8Array(digest));

    const verified = await verifyPreparedPurchaseHash(prepared, {
      recomputeOfficialHash: official,
      recomputePrecheckHash: precheck,
    });

    expect(precheck).toHaveBeenCalledOnce();
    expect(official).toHaveBeenCalledOnce();
    expect(verified).toEqual({
      observationId: prepared.observationId,
      preparedTransactionHash: Buffer.from(digest).toString("base64"),
      verifiedAt: "2026-07-13T10:00:02.000Z",
    });
    expect(JSON.stringify(verified)).not.toContain('"preparedTransaction":');
  });

  it("stops before the official oracle after a precheck mismatch", async () => {
    const prepared = await observation();
    const official = vi.fn(async () => new Uint8Array(digest));

    await expect(
      verifyPreparedPurchaseHash(prepared, {
        recomputeOfficialHash: official,
        recomputePrecheckHash: async () => new Uint8Array(32).fill(8),
      }),
    ).rejects.toThrow(/precheck/i);
    expect(official).not.toHaveBeenCalled();
  });

  it("consumes a preparation after an official mismatch", async () => {
    const prepared = await observation();
    const dependencies = {
      recomputeOfficialHash: async () => new Uint8Array(32).fill(8),
    };

    await expect(
      verifyPreparedPurchaseHash(prepared, dependencies),
    ).rejects.toThrow(/official/i);
    await expect(
      verifyPreparedPurchaseHash(prepared, dependencies),
    ).rejects.toThrow(/already claimed/i);
  });

  it("rejects cloned observations and invalid digest lengths", async () => {
    const prepared = await observation();

    await expect(
      verifyPreparedPurchaseHash(structuredClone(prepared), {
        recomputeOfficialHash: async () => new Uint8Array(digest),
      }),
    ).rejects.toThrow(/authenticated/i);
    await expect(
      verifyPreparedPurchaseHash(prepared, {
        recomputeOfficialHash: async () => new Uint8Array(31),
      }),
    ).rejects.toThrow(/32 bytes/i);
  });
});
