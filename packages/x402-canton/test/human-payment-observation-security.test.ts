import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHumanPaymentObserver,
  readHumanPaymentAuthority,
} from "../src/human-payment-observation.js";

const NOW = "2026-07-16T15:00:00.000Z";
const URL = "https://provider.example/paid/weather";
const header = Buffer.from('{"x402Version":2}').toString("base64");

function paymentRequired(): Response {
  return new Response(null, {
    headers: { "PAYMENT-REQUIRED": header },
    status: 402,
  });
}

describe("human HTTP payment observation security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("enforces cancellation and deadline without leaking abort reasons", async () => {
    const hanging = createHumanPaymentObserver(
      async () => new Promise<never>(() => undefined),
    );
    const controller = new AbortController();
    const cancelled = hanging(
      { method: "GET", url: URL },
      { signal: controller.signal },
    );
    controller.abort("private caller token");
    await expect(cancelled).rejects.toThrow("human payment fetch cancelled");

    const expired = hanging(
      { method: "GET", url: URL },
      { timeoutMilliseconds: 10 },
    );
    const rejection = expect(expired).rejects.toThrow(
      "human payment fetch deadline exceeded",
    );
    await vi.advanceTimersByTimeAsync(11);
    await rejection;
  });

  it("redacts transport errors and rejects malformed HTTP outcomes", async () => {
    const secret = "private provider credential";
    const failed = createHumanPaymentObserver(async () => {
      throw new Error(secret);
    });
    let failure: unknown;
    try {
      await failed({ method: "GET", url: URL });
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(new Error("human payment fetch failed"));
    expect((failure as Error).message).not.toContain(secret);

    await expect(
      createHumanPaymentObserver(
        async () => new Response(null, { status: 200 }),
      )({ method: "GET", url: URL }),
    ).rejects.toThrow(/authentic HTTP 402/iu);
    await expect(
      createHumanPaymentObserver(
        async () => new Response(null, { status: 402 }),
      )({ method: "GET", url: URL }),
    ).rejects.toThrow(/PAYMENT-REQUIRED/iu);
  });

  it("inherits stale and rollback rejection from the authenticated 402", async () => {
    const observe = createHumanPaymentObserver(async () => paymentRequired());
    const stale = await observe({ method: "GET", url: URL });
    vi.advanceTimersByTime(600_001);
    expect(() => readHumanPaymentAuthority(stale)).toThrow(/stale/iu);

    vi.setSystemTime(new Date(NOW));
    const rollback = await observe({ method: "GET", url: URL });
    vi.setSystemTime(new Date("2026-07-16T14:59:54.999Z"));
    expect(() => readHumanPaymentAuthority(rollback)).toThrow(/clock/iu);
  });

  it.each([0, 10_001, 1.5, Number.NaN])(
    "rejects invalid timeout %s before transport",
    async (timeoutMilliseconds) => {
      const fetcher = vi.fn(async () => paymentRequired());
      await expect(
        createHumanPaymentObserver(fetcher)(
          { method: "GET", url: URL },
          { timeoutMilliseconds },
        ),
      ).rejects.toThrow(/timeout/iu);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
