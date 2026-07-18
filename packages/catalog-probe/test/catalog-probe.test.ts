import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogProbe } from "../src/index.js";
import {
  catalogPaymentChallenge,
  catalogProbeInput,
  catalogProbeResponse,
  catalogProbeStore,
  OBSERVATION_ID,
  ORIGIN_ID,
  RESOURCE_ID,
  REVISION_ID,
  RESOURCE_URL,
} from "./catalog-probe.fixtures.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("catalog probe acquisition", () => {
  it("derives payment authority from the server response and persists it", async () => {
    const database = catalogProbeStore();
    const resolveAddresses = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
    ]);
    let persistedBeforeResponse = false;
    database.recordProbeHealth.mockImplementation(async ({ health }) => {
      persistedBeforeResponse = false;
      return { id: health.healthObservationId, outcome: "created" as const };
    });
    const requestPinnedHttps = vi.fn(async (target, request) => {
      persistedBeforeResponse =
        database.recordProbeHealth.mock.calls.length > 0;
      expect(target.url).toBe(RESOURCE_URL);
      expect(request).toMatchObject({ method: "GET" });
      return catalogProbeResponse();
    });
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      store: database.api,
      resolveAddresses,
      requestPinnedHttps,
    });

    const result = await probe.acquireAndRecord(catalogProbeInput());

    expect(result.outcome).toBe("observed");
    if (result.outcome !== "observed")
      throw new Error("probe was not observed");
    expect(persistedBeforeResponse).toBe(false);
    expect(database.findProviderOriginById).toHaveBeenCalledWith(ORIGIN_ID);
    expect(result.observation).toMatchObject({
      observationId: OBSERVATION_ID,
      originId: ORIGIN_ID,
      resourceId: RESOURCE_ID,
      method: "GET",
      routeTemplate: "/weather/current",
      httpStatus: 402,
      result: {
        kind: "verified-x402",
        revisionId: REVISION_ID,
        amountAtomic: "2500000000",
        asset: "CC",
        network: "canton:devnet",
        recipient: "sotto-weather-provider::1220provider",
        transferMethod: "transfer-factory",
      },
    });
    expect(result.observation.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(database.recordProbeHealth).toHaveBeenCalledWith({
      health: result.health,
      probe: result.observation,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /feePayer|synchronizer|instrumentId|PAYMENT-REQUIRED/u,
    );
  });

  it.each([
    ["ordinary 200", catalogProbeResponse(200), "HTTP_200"],
    [
      "missing carrier",
      new Response(null, { status: 402 }),
      "MISSING_PAYMENT_REQUIRED",
    ],
    [
      "unsupported challenge",
      catalogProbeResponse(402, {
        ...catalogPaymentChallenge(),
        x402Version: 1,
      }),
      "UNSUPPORTED_REQUIREMENT",
    ],
    [
      "unpersistable payment identity",
      catalogProbeResponse(402, {
        ...catalogPaymentChallenge(),
        accepts: [
          {
            ...catalogPaymentChallenge().accepts[0],
            asset: "A".repeat(65),
          },
        ],
      }),
      "UNSUPPORTED_REQUIREMENT",
    ],
  ])("persists %s as non-x402", async (_name, serverResponse, reason) => {
    const database = catalogProbeStore();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      store: database.api,
      resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      requestPinnedHttps: async () => serverResponse,
    });

    const result = await probe.acquireAndRecord(catalogProbeInput());

    expect(result.outcome).toBe("observed");
    if (result.outcome !== "observed")
      throw new Error("probe was not observed");
    expect(result.observation).toMatchObject({
      httpStatus: serverResponse.status,
      result: { kind: "non-x402", reason },
    });
    expect(database.recordProbeHealth).toHaveBeenCalledOnce();
  });
});
