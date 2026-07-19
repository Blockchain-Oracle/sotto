import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryProviderDeliveryClaims,
  PROVIDER_DELIVERY_DURABILITY,
  type ProviderDeliveryClaimKey,
} from "../src/provider-delivery-claim.js";

const key = Object.freeze({
  attemptId: `sha256:${"a".repeat(64)}`,
  requestCommitment: `sha256:${"b".repeat(64)}`,
  updateId: `1220${"c".repeat(64)}`,
}) satisfies ProviderDeliveryClaimKey;

function deliveredResponse(run: number): Response {
  return new Response(JSON.stringify({ privateResult: "delivered", run }), {
    headers: {
      "content-type": "application/json",
      "x-delivery-run": String(run),
    },
    status: 200,
    statusText: "Paid",
  });
}

describe("in-memory provider delivery claims", () => {
  it("declares the spike-only durability boundary", () => {
    expect(PROVIDER_DELIVERY_DURABILITY).toBe(
      "process-memory-spike-only; production-requires-postgresql",
    );
    expect(createInMemoryProviderDeliveryClaims().durability).toBe(
      PROVIDER_DELIVERY_DURABILITY,
    );
  });

  it("executes concurrent delivery once and returns exact cached retries", async () => {
    const claims = createInMemoryProviderDeliveryClaims();
    let run = 0;
    const deliver = vi.fn(async () => deliveredResponse(++run));

    const [first, concurrent] = await Promise.all([
      claims.claim(key, { deliver, verify: async () => true }),
      claims.claim(key, { deliver, verify: async () => true }),
    ]);
    const retry = await claims.claim(key, {
      deliver,
      verify: async () => true,
    });
    if (
      first === undefined ||
      concurrent === undefined ||
      retry === undefined
    ) {
      throw new Error("delivery response is absent");
    }

    expect(deliver).toHaveBeenCalledOnce();
    expect(
      await Promise.all(
        [first, concurrent, retry].map(async (response) => ({
          body: await response.text(),
          contentType: response.headers.get("content-type"),
          deliveryRun: response.headers.get("x-delivery-run"),
          status: response.status,
          statusText: response.statusText,
        })),
      ),
    ).toEqual([
      {
        body: '{"privateResult":"delivered","run":1}',
        contentType: "application/json",
        deliveryRun: "1",
        status: 200,
        statusText: "Paid",
      },
      {
        body: '{"privateResult":"delivered","run":1}',
        contentType: "application/json",
        deliveryRun: "1",
        status: 200,
        statusText: "Paid",
      },
      {
        body: '{"privateResult":"delivered","run":1}',
        contentType: "application/json",
        deliveryRun: "1",
        status: 200,
        statusText: "Paid",
      },
    ]);
  });

  it.each([
    ["attemptId", { ...key, attemptId: `sha256:${"d".repeat(64)}` }],
    [
      "requestCommitment",
      { ...key, requestCommitment: `sha256:${"e".repeat(64)}` },
    ],
    ["updateId", { ...key, updateId: `1220${"f".repeat(64)}` }],
  ] as const)("includes %s in the claim identity", async (_name, changed) => {
    const claims = createInMemoryProviderDeliveryClaims();
    const deliver = vi.fn(async () => deliveredResponse(1));

    await claims.claim(key, { deliver, verify: async () => true });
    await claims.claim(changed, { deliver, verify: async () => true });

    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("does not persist an unverified result", async () => {
    const claims = createInMemoryProviderDeliveryClaims();
    const notYetVerified = vi.fn(async () => false);
    const deliver = vi.fn(async () => deliveredResponse(1));

    await expect(
      claims.claim(key, { deliver, verify: notYetVerified }),
    ).resolves.toBeUndefined();
    await expect(
      claims.claim(key, { deliver, verify: notYetVerified }),
    ).resolves.toBeUndefined();

    expect(notYetVerified).toHaveBeenCalledTimes(2);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("retries verification failures before delivery starts", async () => {
    const claims = createInMemoryProviderDeliveryClaims();
    const verify = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("ledger unavailable"))
      .mockResolvedValueOnce(true);
    const deliver = vi.fn(async () => deliveredResponse(1));

    await expect(claims.claim(key, { deliver, verify })).rejects.toThrow(
      "ledger unavailable",
    );
    await expect(
      claims.claim(key, { deliver, verify }),
    ).resolves.toBeInstanceOf(Response);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("never retries an unknown delivery outcome", async () => {
    const claims = createInMemoryProviderDeliveryClaims();
    const deliver = vi.fn(async () => {
      throw new Error("upstream response lost after side effect");
    });
    const operation = { deliver, verify: async () => true };

    await expect(claims.claim(key, operation)).rejects.toThrow(
      "provider delivery outcome is unknown",
    );
    await expect(claims.claim(key, operation)).rejects.toThrow(
      "provider delivery outcome is unknown",
    );
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("never retries when response materialization fails after delivery", async () => {
    const claims = createInMemoryProviderDeliveryClaims();
    const deliver = vi.fn(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.error(new Error("response stream failed"));
        },
      });
      return new Response(body);
    });
    const operation = { deliver, verify: async () => true };

    await expect(claims.claim(key, operation)).rejects.toThrow(
      "provider delivery outcome is unknown",
    );
    await expect(claims.claim(key, operation)).rejects.toThrow(
      "provider delivery outcome is unknown",
    );
    expect(deliver).toHaveBeenCalledOnce();
  });
});
