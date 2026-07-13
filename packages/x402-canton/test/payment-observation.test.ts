import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePaymentRequiredResponse } from "../src/index.js";
import { readPaymentRequiredObservation } from "../src/payment-observation.js";

const challenge = new TextEncoder().encode(
  JSON.stringify({
    x402Version: 2,
    resource: { url: "https://example.test" },
    accepts: [],
  }),
);
const header = Buffer.from(challenge).toString("base64");

function response(value = header, status = 402): Response {
  return new Response(null, {
    headers: { "PAYMENT-REQUIRED": value },
    status,
  });
}

afterEach(() => vi.useRealTimers());

describe("trusted PAYMENT-REQUIRED observation", () => {
  it("captures only a redacted identity while retaining exact bytes privately", () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    const observation = capturePaymentRequiredResponse(response());

    expect(observation).toEqual({
      challengeId: `sha256:${createHash("sha256").update(challenge).digest("hex")}`,
      httpStatus: 402,
      observedAt: "2026-07-13T10:00:00.000Z",
    });
    expect(JSON.stringify(observation)).not.toContain("x402Version");
    expect(readPaymentRequiredObservation(observation).challengeBytes).toEqual(
      challenge,
    );
  });

  it.each([
    ["non-402 response", response(header, 200), "HTTP 402"],
    [
      "missing header",
      new Response(null, { status: 402 }),
      "PAYMENT-REQUIRED header",
    ],
    ["noncanonical base64", response("YQ"), "canonical base64"],
    ["oversized header", response("a".repeat(16_388)), "16384 bytes"],
  ] as const)("rejects %s", (_name, input, message) => {
    expect(() => capturePaymentRequiredResponse(input)).toThrow(message);
  });

  it("expires the private observation authority after ten minutes", () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    const observation = capturePaymentRequiredResponse(response());
    vi.advanceTimersByTime(600_001);

    expect(() => readPaymentRequiredObservation(observation)).toThrow("stale");
  });

  it("rejects a wall-clock rollback beyond tolerance", () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    const observation = capturePaymentRequiredResponse(response());
    vi.setSystemTime(new Date("2026-07-13T09:59:54.999Z"));

    expect(() => readPaymentRequiredObservation(observation)).toThrow("clock");
  });
});
