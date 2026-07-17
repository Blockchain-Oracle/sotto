import type { AuthenticatedHumanWalletConnectorPreflight } from "@sotto/x402-canton";
import { describe, expect, it, vi } from "vitest";
import type { FiveNorthHumanWalletProfile } from "../src/five-north-human-wallet-profile.js";
import { runLiveFiveNorthHumanPrepare } from "../src/live-five-north-human-prepare.js";

const FINGERPRINT = `1220${"a".repeat(64)}` as const;
const PAYER = `sotto-external-payer::${FINGERPRINT}`;
const PROVIDER = `sotto-provider::1220${"b".repeat(64)}`;
const DSO = `DSO::1220${"c".repeat(64)}`;
const SYNCHRONIZER = `global-domain::1220${"d".repeat(64)}`;
const RESOURCE = "https://human-live.trycloudflare.com/paid/weather";
const network = Object.freeze({
  audience: "https://ledger.example",
  clientId: "client",
  clientSecret: "secret",
  issuerUrl: "https://issuer.example",
  ledgerUrl: "https://ledger.example",
  scope: "openid",
  tokenUrl: "https://issuer.example/token",
  validatorUrl: "https://validator.example",
});

function profile(): FiveNorthHumanWalletProfile {
  return Object.freeze({
    fingerprint: FINGERPRINT,
    party: PAYER,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
    synchronizerId: SYNCHRONIZER,
    topologyHash: "EiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  });
}

function rules() {
  return {
    amulet_rules: {
      contract: { payload: { dso: DSO } },
      domain_id: SYNCHRONIZER,
    },
  };
}

function input(signal = new AbortController().signal) {
  return {
    keyFile: "/workspace/.capability-wallet/payer.key",
    network,
    port: 8_791,
    providerParty: PROVIDER,
    signal,
    workspaceRoot: "/workspace",
  };
}

function dependencies(events: string[], prepareError?: Error) {
  const close = vi.fn(async () => {
    events.push("provider-close");
  });
  const createWalletPreflight = vi.fn(async () => {
    events.push("wallet-preflight");
    return {} as AuthenticatedHumanWalletConnectorPreflight;
  });
  const claimPackageSelection = vi.fn(async () => ({}) as never);
  const createReaders = vi.fn(() => ({}) as never);
  const preparePurchase = vi.fn(async (purchaseInput) => {
    events.push("prepare-purchase");
    await purchaseInput.createWalletPreflight(purchaseInput.signal!);
    purchaseInput.createReaders(purchaseInput.signal!, {} as never);
    if (prepareError !== undefined) throw prepareError;
    return {
      approval: {
        action: "pay-for-api-call",
        amountAtomic: "2500000000",
      },
      status: "prepared-hash-verified-not-signed",
      verified: {},
    } as never;
  });
  return {
    claimPackageSelection,
    close,
    createPackageSelectionClaimer: vi.fn(() => {
      events.push("package-claimer");
      return claimPackageSelection;
    }),
    createPrepareTransport: vi.fn(() => {
      events.push("prepare-transport");
      return {
        readAmuletRules: async () => {
          events.push("rules");
          return rules();
        },
      } as never;
    }),
    createPurchaseReaders: vi.fn(() => {
      events.push("purchase-readers");
      return createReaders();
    }),
    createWalletPreflight,
    preparePurchase,
    readProfile: vi.fn(async () => {
      events.push("profile");
      return profile();
    }),
    recomputeOfficialHash: vi.fn(async () => new Uint8Array(32)),
    startProviderSession: vi.fn(async () => {
      events.push("provider-start");
      return {
        close,
        fetchAuthorized: vi.fn(),
        resourceUrl: RESOURCE,
      };
    }),
  };
}

describe("live read-only Five North human preparation", () => {
  it("grounds one real preparation and stops before signing", async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    const result = await runLiveFiveNorthHumanPrepare(input(), ports);

    expect(result.status).toBe("prepared-hash-verified-not-signed");
    expect(events).toEqual([
      "profile",
      "prepare-transport",
      "rules",
      "provider-start",
      "package-claimer",
      "prepare-purchase",
      "wallet-preflight",
      "purchase-readers",
      "provider-close",
    ]);
    const purchase = ports.preparePurchase.mock.calls[0]![0];
    expect(purchase).toMatchObject({
      expectedProviderParty: PROVIDER,
      maximumFeeAtomic: "750000000",
      request: { method: "GET", url: RESOURCE },
      timeoutMilliseconds: 30_000,
      trustedConfiguration: {
        expectedAdmin: DSO,
        expectedAsset: "CC",
        expectedInstrumentId: "Amulet",
        maximumAllowedFeeAtomic: "1000000000",
      },
    });
    expect(purchase).not.toHaveProperty("sign");
    expect(purchase).not.toHaveProperty("execute");
    expect(ports.close).toHaveBeenCalledOnce();
  });

  it("closes the provider when strict preparation fails", async () => {
    const events: string[] = [];
    const ports = dependencies(events, new Error("prepared effects mismatch"));

    await expect(runLiveFiveNorthHumanPrepare(input(), ports)).rejects.toThrow(
      "prepared effects mismatch",
    );
    expect(ports.close).toHaveBeenCalledOnce();
  });

  it("rejects a synchronizer mismatch before opening a provider", async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    ports.readProfile.mockResolvedValueOnce({
      ...profile(),
      synchronizerId: `other::1220${"e".repeat(64)}`,
    });

    await expect(runLiveFiveNorthHumanPrepare(input(), ports)).rejects.toThrow(
      /synchronizer/iu,
    );
    expect(ports.startProviderSession).not.toHaveBeenCalled();
  });
});
