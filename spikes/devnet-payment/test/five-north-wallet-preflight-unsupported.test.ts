import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import { evaluateFiveNorthWalletPreflight } from "../src/five-north-wallet-preflight.js";
import { createFiveNorthWalletPreflightTransport } from "../src/five-north-wallet-preflight-transport.js";

const AGENT = `sotto-agent::1220${"a".repeat(64)}`;
const PAYER = `sotto-payer::1220${"b".repeat(64)}`;
const SYNCHRONIZER = `global-domain::1220${"c".repeat(64)}`;
const ADMIN = `DSO::1220${"d".repeat(64)}`;
const SUBJECT = "wallet-preflight-user";
const TOKEN = `header.${Buffer.from(JSON.stringify({ sub: SUBJECT })).toString(
  "base64url",
)}.signature`;
const PUBLIC_KEY = Buffer.alloc(32, 7).toString("base64");
const FINGERPRINT = `1220${"e".repeat(64)}` as `1220${string}`;
const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "client-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

it("reports expected unsupported Five North capabilities without ambiguity", async () => {
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    if (method === "GET" && path === "/v2/authenticated-user") {
      return json({ user: { id: SUBJECT } });
    }
    if (method === "GET" && path.endsWith("/rights")) {
      return json({
        rights: [{ kind: { CanExecuteAs: { value: { party: AGENT } } } }],
      });
    }
    if (method === "GET" && path.startsWith("/v2/parties/")) {
      return json({ partyDetails: [{ party: AGENT }] });
    }
    if (method === "GET" && path === "/v2/state/connected-synchronizers") {
      return json({
        connectedSynchronizers: [{ synchronizerId: SYNCHRONIZER }],
      });
    }
    if (method === "GET" && path.endsWith("/v0/scan-proxy/amulet-rules")) {
      return json({
        amulet_rules: {
          contract: { payload: { dso: ADMIN } },
          domain_id: SYNCHRONIZER,
        },
      });
    }
    if (
      (method === "GET" &&
        path === `/v2/packages/${SOTTO_CONTROL_PACKAGE_ID}`) ||
      (method === "POST" &&
        [
          "/v2/interactive-submission/preferred-packages",
          "/v2/parties/external/generate-topology",
        ].includes(path))
    ) {
      return json({ code: "NOT_FOUND" }, 404);
    }
    if (method === "HEAD") return new Response(null, { status: 405 });
    throw new Error(`unexpected preflight route ${method} ${path}`);
  });
  const transport = createFiveNorthWalletPreflightTransport(network, {
    createExternalPartyIdentity: async () => ({
      fingerprint: FINGERPRINT,
      hashTopology: vi.fn(async () => "unused"),
      publicKey: PUBLIC_KEY,
    }),
    fetcher,
    signal: new AbortController().signal,
    tokenProvider: {
      accessToken: async () => TOKEN,
      invalidate: vi.fn(),
    },
  });

  const snapshot = await transport({ agentParty: AGENT, payerParty: PAYER });
  const result = evaluateFiveNorthWalletPreflight(snapshot, {
    agentParty: AGENT,
    payerParty: PAYER,
  });

  expect(result.verdict).toBe("UNSUPPORTED");
  expect(result.reasons).toEqual([
    "EXTERNAL_PARTY_TOPOLOGY_UNSUPPORTED",
    "PREFERRED_PACKAGE_UNCONFIRMED",
    "SOTTO_PACKAGE_UNAVAILABLE",
  ]);
});
