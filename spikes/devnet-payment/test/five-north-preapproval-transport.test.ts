import { describe, expect, it, vi } from "vitest";
import {
  createFiveNorthPrepareTransport,
  type FiveNorthPrepareTransport,
} from "../src/five-north-prepare-transport.js";
import type { SpikeConfig } from "../src/config.js";

const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "test-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};
const PAYER = "sotto-prepare-payer::1220payer";
const RECEIVER = `sotto-spike-provider::1220${"1".repeat(64)}`;
const VALIDATOR = `five-north-validator::1220${"2".repeat(64)}`;

function tokenResponse(): Response {
  const payload = Buffer.from(
    JSON.stringify({ sub: "ledger-user-6" }),
  ).toString("base64url");
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

function createTransport(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
) {
  return createFiveNorthPrepareTransport(network, PAYER, {
    fetcher,
    signal: new AbortController().signal,
  });
}

describe("Five North preapproval transport", () => {
  it("exposes bounded reads without execute or signing", () => {
    const transport = createTransport(vi.fn(async () => tokenResponse()));
    expect(Object.keys(transport).sort()).toEqual([
      "readAmuletRules",
      "readAuthenticatedUserId",
      "readCapabilityContracts",
      "readHoldingContracts",
      "readLedgerEnd",
      "readPreapprovalStateContracts",
      "readPreferredWalletPackage",
      "readPrepare",
      "readRegistry",
      "readTransferPreapproval",
      "readValidatorUser",
    ] satisfies Array<keyof FiveNorthPrepareTransport>);
    expect(transport).not.toHaveProperty("execute");
    expect(transport).not.toHaveProperty("sign");
    expect(transport).not.toHaveProperty("submitSettlement");
  });

  it("reads exact prerequisites with one fresh ACS offset", async () => {
    const bodies: unknown[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) return tokenResponse();
      if (url.endsWith("/v0/validator-user")) {
        return Response.json({
          featured: true,
          party_id: VALIDATOR,
          user_name: "validator",
        });
      }
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({
          amulet_rules: { contract: {}, domain_id: "sync" },
        });
      }
      if (url.endsWith("/v2/interactive-submission/preferred-packages")) {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({
          packageReferences: [
            {
              packageId: "f".repeat(64),
              packageName: "splice-wallet",
              packageVersion: "0.1.21",
            },
          ],
          synchronizerId: `global-domain::1220${"4".repeat(64)}`,
        });
      }
      if (url.endsWith("/v2/state/ledger-end"))
        return Response.json({ offset: 42 });
      if (url.endsWith("/v2/state/active-contracts")) {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json([]);
      }
      if (url.includes("/v0/scan-proxy/transfer-preapprovals/by-party/")) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      throw new Error(`unexpected test URL ${url}`);
    });
    const transport = createTransport(fetcher);

    await expect(transport.readValidatorUser()).resolves.toMatchObject({
      featured: true,
      party_id: VALIDATOR,
    });
    await expect(transport.readAmuletRules()).resolves.toHaveProperty(
      "amulet_rules",
    );
    await expect(transport.readAuthenticatedUserId()).resolves.toBe(
      "ledger-user-6",
    );
    await expect(
      transport.readPreferredWalletPackage(RECEIVER, VALIDATOR),
    ).resolves.toHaveProperty("synchronizerId");
    await expect(
      transport.readPreapprovalStateContracts(RECEIVER),
    ).resolves.toEqual({
      activeAtOffset: 42,
      contracts: [],
    });
    await expect(
      transport.readTransferPreapproval(RECEIVER),
    ).resolves.toBeNull();
    expect(bodies[0]).toEqual({
      packageVettingRequirements: [
        { packageName: "splice-wallet", parties: [RECEIVER, VALIDATOR] },
      ],
    });
    expect(JSON.stringify(bodies[1])).toContain(
      "#splice-wallet:Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal",
    );
    expect(JSON.stringify(bodies[1])).toContain(
      "#splice-amulet:Splice.AmuletRules:TransferPreapproval",
    );
    expect(bodies[1]).toMatchObject({ activeAtOffset: 42 });
  });
});
