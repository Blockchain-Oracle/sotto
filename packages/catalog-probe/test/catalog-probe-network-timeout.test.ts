import { expect, it } from "vitest";
import { createCatalogProbe } from "../src/index.js";
import {
  catalogProbeInput,
  catalogProbeResponse,
  catalogProbeStore,
} from "./catalog-probe.fixtures.js";

it("starts the network timeout after durable acquisition reads", async () => {
  const database = catalogProbeStore();
  database.findProbeHealthById.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return null;
  });
  const probe = createCatalogProbe({
    expectedNetwork: "canton:devnet",
    resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
    requestPinnedHttps: async () => catalogProbeResponse(),
    store: database.api,
  });

  await expect(
    probe.acquireAndRecord(catalogProbeInput(), {
      networkTimeoutMilliseconds: 5,
    }),
  ).resolves.toMatchObject({ outcome: "observed" });
});
