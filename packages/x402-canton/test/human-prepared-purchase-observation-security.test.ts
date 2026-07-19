import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanPreparedPurchaseObserver } from "../src/human-prepared-purchase-observation.js";
import { readHumanPurchasePrepareRequest } from "../src/human-purchase-command-state.js";
import { MAX_PREPARE_RESPONSE_BYTES } from "../src/prepared-purchase-resource-envelope.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  rootOnlyHumanPreparedPurchaseBytes,
} from "./human-prepared-purchase.fixtures.js";

const participantHash = Buffer.alloc(32, 7).toString("base64");

function response(
  transaction: Uint8Array,
  overrides: Record<string, unknown> = {},
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: participantHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
      ...overrides,
    }),
  );
}

describe("human prepared Purchase observation security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects invalid readers without touching request authority", async () => {
    const { request } = await humanPreparedPurchaseCommandInputs();
    expect(() => createHumanPreparedPurchaseObserver(null as never)).toThrow(
      /reader is required/iu,
    );
    expect(readHumanPurchasePrepareRequest(request).request).toBe(request);
  });

  it("rejects forged requests before transport", async () => {
    const { request } = await humanPreparedPurchaseCommandInputs();
    const reader = vi.fn();

    await expect(
      createHumanPreparedPurchaseObserver(reader)(structuredClone(request)),
    ).rejects.toThrow(/not authenticated/iu);
    expect(reader).not.toHaveBeenCalled();
  });

  it("validates options before consuming request authority", async () => {
    const { request } = await humanPreparedPurchaseCommandInputs();
    const reader = vi.fn();

    await expect(
      createHumanPreparedPurchaseObserver(reader)(request, null as never),
    ).rejects.toThrow(/options are invalid/iu);
    expect(readHumanPurchasePrepareRequest(request).request).toBe(request);
    expect(reader).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort("private caller reason");
    await expect(
      createHumanPreparedPurchaseObserver(reader)(request, {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/iu);
    expect(readHumanPurchasePrepareRequest(request).request).toBe(request);
  });

  it("allows exactly one concurrent transport", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = response(humanPreparedPurchaseBytes(intent, request));
    let release!: (value: Uint8Array) => void;
    const pending = new Promise<Uint8Array>((resolve) => (release = resolve));
    const reader = vi.fn(async () => pending);
    const observe = createHumanPreparedPurchaseObserver(reader);
    const first = observe(request);
    const second = observe(request);

    await expect(second).rejects.toThrow(/already claimed/iu);
    release(bytes);
    await expect(first).resolves.toMatchObject({
      observedAt: HUMAN_PURCHASE_NOW,
    });
    expect(reader).toHaveBeenCalledOnce();
  });

  it("sanitizes transport failures", async () => {
    const { request } = await humanPreparedPurchaseCommandInputs();
    const observe = createHumanPreparedPurchaseObserver(async () => {
      throw new Error("private upstream response body");
    });

    await expect(observe(request)).rejects.toEqual(
      new Error("human prepared Purchase read failed"),
    );
  });

  it("enforces caller cancellation and the absolute deadline", async () => {
    const first = await humanPreparedPurchaseCommandInputs();
    const controller = new AbortController();
    const cancelled = createHumanPreparedPurchaseObserver(
      async () => new Promise<never>(() => undefined),
    )(first.request, { signal: controller.signal });
    controller.abort("private reason");
    await expect(cancelled).rejects.toThrow(
      "human prepared Purchase cancelled",
    );

    const second = await humanPreparedPurchaseCommandInputs();
    const expired = createHumanPreparedPurchaseObserver(
      async () => new Promise<never>(() => undefined),
    )(second.request, { timeoutMilliseconds: 10 });
    const expiration = expect(expired).rejects.toThrow(/deadline exceeded/iu);
    await vi.advanceTimersByTimeAsync(11);
    await expiration;
  });

  it("rejects oversized or shared response storage", async () => {
    const oversized = await humanPreparedPurchaseCommandInputs();
    await expect(
      createHumanPreparedPurchaseObserver(
        async () => new Uint8Array(MAX_PREPARE_RESPONSE_BYTES + 1),
      )(oversized.request),
    ).rejects.toThrow();

    const shared = await humanPreparedPurchaseCommandInputs();
    await expect(
      createHumanPreparedPurchaseObserver(
        async () => new Uint8Array(new SharedArrayBuffer(32)),
      )(shared.request),
    ).rejects.toThrow();
  });

  it("rejects malformed envelopes and incomplete effects", async () => {
    const wrongScheme = await humanPreparedPurchaseCommandInputs();
    const valid = humanPreparedPurchaseBytes(
      wrongScheme.intent,
      wrongScheme.request,
    );
    await expect(
      createHumanPreparedPurchaseObserver(async () =>
        response(valid, { hashingSchemeVersion: "HASHING_SCHEME_VERSION_V3" }),
      )(wrongScheme.request),
    ).rejects.toThrow(/scheme V2/iu);

    const rootOnly = await humanPreparedPurchaseCommandInputs();
    await expect(
      createHumanPreparedPurchaseObserver(async () =>
        response(
          rootOnlyHumanPreparedPurchaseBytes(rootOnly.intent, rootOnly.request),
        ),
      )(rootOnly.request),
    ).rejects.toThrow(/prepared.*effect/iu);
  });
});
