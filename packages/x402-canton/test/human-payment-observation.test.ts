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

  it("reads caller accessors once for both commitment and transport", async () => {
    const reads = new Map<string, number>();
    const once =
      <T>(name: string, first: T, later: T): (() => T) =>
      () => {
        const count = (reads.get(name) ?? 0) + 1;
        reads.set(name, count);
        return count === 1 ? first : later;
      };
    const fetchAuthorized = vi.fn(async (request) => {
      expect(request).toMatchObject({
        body: new TextEncoder().encode("first-body"),
        headers: [["x-request-mode", "first"]],
        method: "GET",
        url: URL,
      });
      return paymentRequired();
    });
    const input = Object.defineProperties(
      {},
      {
        additionalAuthoritativeHeaders: {
          enumerable: true,
          get: once(
            "additionalAuthoritativeHeaders",
            ["x-request-mode"],
            ["x-later"],
          ),
        },
        body: {
          enumerable: true,
          get: once(
            "body",
            new TextEncoder().encode("first-body"),
            new TextEncoder().encode("later-body"),
          ),
        },
        headers: {
          enumerable: true,
          get: once(
            "headers",
            [["x-request-mode", "first"]],
            [["x-later", "later"]],
          ),
        },
        method: { enumerable: true, get: once("method", "GET", "POST") },
        url: {
          enumerable: true,
          get: once("url", URL, "https://attacker.example/other"),
        },
      },
    );

    const observation = await createHumanPaymentObserver(fetchAuthorized)(
      input as never,
    );
    const expected = commitHttpRequest({
      additionalAuthoritativeHeaders: ["x-request-mode"],
      body: new TextEncoder().encode("first-body"),
      headers: [["x-request-mode", "first"]],
      method: "GET",
      url: URL,
    });

    expect(observation.requestCommitment).toBe(expected.commitment);
    expect([...reads.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  it.each([
    "authorization",
    "cookie",
    "payment-signature",
    "proxy-authorization",
    "x-payment",
    "x-payment-signature",
  ])("rejects forbidden transport header %s before fetch", async (name) => {
    const fetchAuthorized = vi.fn(async () => paymentRequired());
    const observe = createHumanPaymentObserver(fetchAuthorized);

    await expect(
      observe({
        headers: [[name, "caller-controlled-secret"]],
        method: "GET",
        url: URL,
      }),
    ).rejects.toThrow(/forbidden.*header/iu);
    expect(fetchAuthorized).not.toHaveBeenCalled();
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
