import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHumanPaymentObserver,
  readHumanPaymentAuthority,
} from "../src/human-payment-observation.js";
import {
  capturePaymentRequiredResponse,
  commitHttpRequest,
} from "../src/index.js";

const NOW = "2026-07-16T15:00:00.000Z";
const URL = "https://provider.example/paid/weather?units=metric";
const challengeBytes = new TextEncoder().encode('{"x402Version":2}');
const challengeHeader = Buffer.from(challengeBytes).toString("base64");

function paymentRequired(): Response {
  return new Response(null, {
    headers: { "PAYMENT-REQUIRED": challengeHeader },
    status: 402,
  });
}

describe("trusted human HTTP payment observation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("snapshots and binds the exact request before the trusted fetch", async () => {
    const body = new TextEncoder().encode('{"city":"Kigali"}');
    const headers: Array<[string, string]> = [
      ["content-type", "application/json"],
      ["x-request-mode", "human"],
    ];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const fetchAuthorized = vi.fn(async (request) => {
      await blocked;
      expect(request).toMatchObject({
        body: new TextEncoder().encode('{"city":"Kigali"}'),
        headers: [
          ["content-type", "application/json"],
          ["x-request-mode", "human"],
        ],
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
        url: URL,
      });
      return paymentRequired();
    });
    const observe = createHumanPaymentObserver(fetchAuthorized);
    const pending = observe({
      additionalAuthoritativeHeaders: ["x-request-mode"],
      body,
      headers,
      method: "POST",
      url: URL,
    });
    body.fill(0);
    headers[0]![1] = "mutated";
    release();
    const observation = await pending;
    const authority = readHumanPaymentAuthority(observation);
    const expectedBinding = commitHttpRequest({
      additionalAuthoritativeHeaders: ["x-request-mode"],
      body: new TextEncoder().encode('{"city":"Kigali"}'),
      headers: [
        ["content-type", "application/json"],
        ["x-request-mode", "human"],
      ],
      method: "POST",
      url: URL,
    });

    expect(authority.binding).toEqual(expectedBinding);
    expect(authority.paymentObservation.challengeId).toBe(
      observation.challengeId,
    );
    expect(observation).toEqual({
      challengeId: observation.challengeId,
      observationId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      observedAt: NOW,
      requestCommitment: expectedBinding.commitment,
    });
  });

  it("rejects clones and standalone locally constructed responses", async () => {
    const observation = await createHumanPaymentObserver(async () =>
      paymentRequired(),
    )({ method: "GET", url: URL });
    const standalone = capturePaymentRequiredResponse(paymentRequired());

    expect(() =>
      readHumanPaymentAuthority(structuredClone(observation)),
    ).toThrow(/human payment observation.*not authenticated/iu);
    expect(() => readHumanPaymentAuthority(standalone)).toThrow(
      /human payment observation.*not authenticated/iu,
    );
    expect(readHumanPaymentAuthority(observation).binding.commitment).toBe(
      observation.requestCommitment,
    );
  });
});
