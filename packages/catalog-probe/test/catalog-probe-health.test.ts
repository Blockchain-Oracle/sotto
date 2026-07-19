import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogProbe } from "../src/index.js";
import {
  catalogProbeInput,
  catalogProbeResponse,
  catalogProbeStore,
} from "./catalog-probe.fixtures.js";

function healthStore() {
  const database = catalogProbeStore();
  const recordProbeHealth = vi.fn(async ({ health }) => ({
    id: health.healthObservationId,
    outcome: "created" as const,
  }));
  const recordHealthObservation = vi.fn(async (health) => ({
    id: health.healthObservationId,
    outcome: "created" as const,
  }));
  return {
    ...database,
    api: {
      ...database.api,
      recordHealthObservation,
      recordProbeHealth,
    },
    recordHealthObservation,
    recordProbeHealth,
  };
}

function monotonic(...values: number[]): () => number {
  const read = vi.fn();
  for (const value of values) read.mockReturnValueOnce(value);
  return read;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("durable catalog probe health", () => {
  it("atomically records healthy verified x402", async () => {
    const database = healthStore();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      monotonicNowMilliseconds: monotonic(100, 225),
      requestPinnedHttps: async () => catalogProbeResponse(),
      resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      store: database.api,
    } as never);

    const result = await probe.acquireAndRecord(catalogProbeInput());

    expect(result.outcome).toBe("observed");
    if (result.outcome !== "observed")
      throw new Error("probe was not observed");
    expect(result).toMatchObject({
      outcome: "observed",
      health: {
        latencyMilliseconds: 125,
        result: { kind: "healthy" },
      },
    });
    expect(database.recordProbeHealth).toHaveBeenCalledWith({
      health: result.health,
      probe: result.observation,
    });
    expect(database.recordProbeObservation).not.toHaveBeenCalled();
  });

  it("records non-x402 as a payment-contract failure", async () => {
    const database = healthStore();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      monotonicNowMilliseconds: monotonic(100, 101),
      requestPinnedHttps: async () => catalogProbeResponse(200),
      resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      store: database.api,
    } as never);

    const result = await probe.acquireAndRecord(catalogProbeInput());

    expect(result).toMatchObject({
      outcome: "observed",
      health: {
        result: {
          kind: "failing",
          domain: "payment-contract",
          code: "HTTP_200",
        },
      },
    });
    expect(database.recordProbeHealth).toHaveBeenCalledOnce();
  });

  it("records unsupported HTTP status without fabricating a probe", async () => {
    const database = healthStore();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      monotonicNowMilliseconds: monotonic(100, 108),
      requestPinnedHttps: async () => new Response(null, { status: 503 }),
      resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      store: database.api,
    } as never);

    const result = await probe.acquireAndRecord(catalogProbeInput());

    expect(result).toMatchObject({
      outcome: "failed",
      health: {
        latencyMilliseconds: 8,
        result: {
          kind: "failing",
          domain: "provider-handler",
          code: "HTTP_STATUS",
          httpStatus: 503,
        },
      },
    });
    expect(database.recordHealthObservation).toHaveBeenCalledWith(
      result.health,
    );
    expect(database.recordProbeHealth).not.toHaveBeenCalled();
  });

  it("records DNS or network failure without leaking its cause", async () => {
    const database = healthStore();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      monotonicNowMilliseconds: monotonic(100, 103),
      resolveAddresses: async () => {
        throw new Error("private resolver detail");
      },
      store: database.api,
    } as never);

    const result = await probe.acquireAndRecord(catalogProbeInput());

    expect(result).toMatchObject({
      outcome: "failed",
      health: {
        result: {
          kind: "failing",
          domain: "transport",
          code: "DNS_OR_NETWORK",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private resolver detail");
    expect(database.recordHealthObservation).toHaveBeenCalledOnce();
  });

  it("records a deadline but never records caller cancellation", async () => {
    vi.useRealTimers();
    const database = healthStore();
    const deadlineProbe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      resolveAddresses: async () => new Promise<never>(() => undefined),
      store: database.api,
    } as never);
    const deadline = await deadlineProbe.acquireAndRecord(catalogProbeInput(), {
      networkTimeoutMilliseconds: 10,
    });
    expect(deadline).toMatchObject({
      outcome: "failed",
      health: {
        result: { kind: "failing", domain: "transport", code: "TIMEOUT" },
      },
    });

    const controller = new AbortController();
    const cancelled = deadlineProbe.acquireAndRecord(
      {
        ...catalogProbeInput(),
        observationId: "018f3f24-7d4a-7e2c-a421-0f3473b96008",
      },
      { signal: controller.signal },
    );
    controller.abort("private caller reason");
    await expect(cancelled).rejects.toThrow("catalog probe cancelled");
    expect(database.recordHealthObservation).toHaveBeenCalledOnce();
  });
});
