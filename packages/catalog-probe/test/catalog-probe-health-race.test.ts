import { expect, it, vi } from "vitest";
import { createCatalogProbe } from "../src/index.js";
import {
  catalogProbeInput,
  catalogProbeStore,
} from "./catalog-probe.fixtures.js";

it("persists a deadline that precedes a later caller abort", async () => {
  vi.useRealTimers();
  const controller = new AbortController();
  const database = catalogProbeStore();
  const probe = createCatalogProbe({
    expectedNetwork: "canton:devnet",
    resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
    requestPinnedHttps: async () =>
      await new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("private transport detail")), 20),
      ),
    store: database.api,
  });
  setTimeout(() => controller.abort("private caller reason"), 10);

  await expect(
    probe.acquireAndRecord(catalogProbeInput(), {
      signal: controller.signal,
      networkTimeoutMilliseconds: 5,
    }),
  ).resolves.toMatchObject({
    outcome: "failed",
    health: {
      result: { kind: "failing", domain: "transport", code: "TIMEOUT" },
    },
  });
  expect(database.recordHealthObservation).toHaveBeenCalledOnce();
});
