import { describe, expect, it, vi } from "vitest";
import type { CatalogRepository } from "@sotto/database";
import { createProbeLoop } from "../src/loops/probe-loop.js";

const NOW = Date.parse("2026-07-19T10:00:00.000Z");

function resource(overrides: Record<string, unknown> = {}) {
  return {
    resourceId: "6a6c0b3e-15a5-4f74-9e2a-0d1f6f2ce001",
    resourceRevisionId: "revision-1",
    listingVersion: 1,
    providerId: "provider-1",
    providerDisplayName: "Weather",
    normalizedOrigin: "https://weather.example.com",
    name: "current-weather",
    description: "Current weather",
    method: "GET",
    routeTemplate: "/weather/current",
    x402Version: 2,
    scheme: "exact",
    network: "canton:devnet",
    asset: "CC",
    recipient: "sotto-provider::1220provider",
    amountAtomic: "2500000000",
    transferMethod: "transfer-factory",
    lastVerifiedAt: "2026-07-19T09:00:00.000Z",
    ...overrides,
  };
}

function fakeCatalog(overrides: Partial<CatalogRepository>): CatalogRepository {
  return {
    listPublishedResources: vi.fn(async () => [resource()]),
    findLatestResourceHealth: vi.fn(async () => null),
    findProviderOrigin: vi.fn(async () => null),
    ...overrides,
  } as unknown as CatalogRepository;
}

describe("catalog probe loop", () => {
  it("stays idle while every published resource has fresh health", async () => {
    const findLatestResourceHealth = vi.fn(async () => ({
      observedAt: "2026-07-19T09:55:00.000Z",
    }));
    const catalog = fakeCatalog({
      findLatestResourceHealth:
        findLatestResourceHealth as unknown as CatalogRepository["findLatestResourceHealth"],
    });
    const loop = createProbeLoop({ catalog, now: () => NOW });
    await expect(loop.runStep(new AbortController().signal)).resolves.toBe(
      "idle",
    );
    expect(findLatestResourceHealth).toHaveBeenCalledWith(
      "6a6c0b3e-15a5-4f74-9e2a-0d1f6f2ce001",
    );
  });

  it("skips listings the probe cannot own (non-GET, non-Canton)", async () => {
    const findLatestResourceHealth = vi.fn(async () => null);
    const catalog = fakeCatalog({
      listPublishedResources: vi.fn(async () => [
        resource({ method: "POST" }),
        resource({ network: "ethereum:mainnet" }),
      ]) as unknown as CatalogRepository["listPublishedResources"],
      findLatestResourceHealth:
        findLatestResourceHealth as unknown as CatalogRepository["findLatestResourceHealth"],
    });
    const loop = createProbeLoop({ catalog, now: () => NOW });
    await expect(loop.runStep(new AbortController().signal)).resolves.toBe(
      "idle",
    );
    expect(findLatestResourceHealth).not.toHaveBeenCalled();
  });

  it("surfaces a stale resource whose origin disappeared", async () => {
    const catalog = fakeCatalog({});
    const loop = createProbeLoop({ catalog, now: () => NOW });
    await expect(
      loop.runStep(new AbortController().signal),
    ).rejects.toThrowError("published resource origin is unavailable");
    expect(catalog.findProviderOrigin).toHaveBeenCalledWith(
      "https://weather.example.com",
    );
  });

  it("yields idle immediately once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const catalog = fakeCatalog({});
    const loop = createProbeLoop({ catalog, now: () => NOW });
    await expect(loop.runStep(controller.signal)).resolves.toBe("idle");
    expect(catalog.findLatestResourceHealth).not.toHaveBeenCalled();
  });

  it("rejects invalid staleness windows", () => {
    expect(() =>
      createProbeLoop({ catalog: fakeCatalog({}), staleMilliseconds: 0 }),
    ).toThrowError("probe staleness window is invalid");
  });
});
