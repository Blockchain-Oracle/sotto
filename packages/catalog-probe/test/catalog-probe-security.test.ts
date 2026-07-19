import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogProbe } from "../src/index.js";
import {
  catalogProbeInput,
  catalogProbeStore,
} from "./catalog-probe.fixtures.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("catalog probe security boundary", () => {
  it.each([undefined, "canton:", "canton:devnet\nother"])(
    "rejects invalid trusted network configuration %s",
    (expectedNetwork) => {
      const database = catalogProbeStore();
      expect(() =>
        createCatalogProbe({ expectedNetwork, store: database.api } as never),
      ).toThrow(/trusted network/iu);
    },
  );

  it("refuses unknown origins before DNS or HTTPS", async () => {
    const database = catalogProbeStore("");
    const resolveAddresses = vi.fn();
    const requestPinnedHttps = vi.fn();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      store: database.api,
      resolveAddresses,
      requestPinnedHttps,
    });

    await expect(probe.acquireAndRecord(catalogProbeInput())).rejects.toThrow(
      /origin/iu,
    );
    expect(resolveAddresses).not.toHaveBeenCalled();
    expect(requestPinnedHttps).not.toHaveBeenCalled();
    expect(database.recordProbeHealth).not.toHaveBeenCalled();
  });

  it.each([
    ["payment/target", { recipient: "attacker::party" }],
    ["normalized origin", { normalizedOrigin: "https://attacker.example" }],
    ["network", { expectedNetwork: "canton:attacker-network" }],
  ])("rejects caller-supplied %s authority", async (_name, injected) => {
    const database = catalogProbeStore();
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      store: database.api,
    });

    await expect(
      probe.acquireAndRecord({ ...catalogProbeInput(), ...injected } as never),
    ).rejects.toThrow(/input keys/iu);
    expect(database.findProviderOriginById).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", undefined],
    ["PUT", new Uint8Array([123, 125])],
    ["GET", new Uint8Array([123, 125])],
  ])(
    "rejects %s or body probing before catalog reads",
    async (method, body) => {
      const database = catalogProbeStore();
      const probe = createCatalogProbe({
        expectedNetwork: "canton:devnet",
        store: database.api,
      });

      await expect(
        probe.acquireAndRecord({
          ...catalogProbeInput(),
          ...(body === undefined ? {} : { body }),
          method,
        } as never),
      ).rejects.toThrow(/catalog probe input/iu);
      expect(database.findProviderOriginById).not.toHaveBeenCalled();
    },
  );
});
