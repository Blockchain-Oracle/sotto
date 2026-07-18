import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogProbe } from "../src/index.js";
import {
  catalogProbeInput,
  catalogProbeResponse,
  catalogProbeStore,
} from "./catalog-probe.fixtures.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it("recovers an acknowledged probe before origin or network access", async () => {
  const firstStore = catalogProbeStore();
  const first = await createCatalogProbe({
    expectedNetwork: "canton:devnet",
    requestPinnedHttps: async () => catalogProbeResponse(),
    resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
    store: firstStore.api,
  }).acquireAndRecord(catalogProbeInput());
  if (first.outcome !== "observed") throw new Error("probe failed");

  const retryStore = catalogProbeStore();
  retryStore.findProbeHealthById.mockResolvedValue({
    health: first.health,
    probe: first.observation,
  });
  const requestPinnedHttps = vi.fn();
  const retry = await createCatalogProbe({
    expectedNetwork: "canton:devnet",
    requestPinnedHttps,
    store: retryStore.api,
  }).acquireAndRecord(catalogProbeInput());

  expect(retry).toEqual({
    ...first,
    persistence: { id: first.health.healthObservationId, outcome: "replayed" },
  });
  expect(retryStore.findProviderOriginById).not.toHaveBeenCalled();
  expect(requestPinnedHttps).not.toHaveBeenCalled();
});

it("rejects same-ID operation substitution before network access", async () => {
  const firstStore = catalogProbeStore();
  const first = await createCatalogProbe({
    expectedNetwork: "canton:devnet",
    requestPinnedHttps: async () => catalogProbeResponse(503),
    resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
    store: firstStore.api,
  }).acquireAndRecord(catalogProbeInput());
  if (first.outcome !== "failed") throw new Error("probe did not fail");

  const retryStore = catalogProbeStore();
  retryStore.findProbeHealthById.mockResolvedValue({
    health: first.health,
    probe: null,
  });
  const requestPinnedHttps = vi.fn();
  const retry = createCatalogProbe({
    expectedNetwork: "canton:devnet",
    requestPinnedHttps,
    store: retryStore.api,
  }).acquireAndRecord({
    ...catalogProbeInput(),
    description: "Substituted description",
  });

  await expect(retry).rejects.toThrow(/operation conflicts/iu);
  expect(requestPinnedHttps).not.toHaveBeenCalled();
});
