import { expect, it, vi } from "vitest";
import { evaluateFiveNorthWalletPreflight } from "../src/five-north-wallet-preflight.js";
import { createFiveNorthWalletPreflightTransport } from "../src/five-north-wallet-preflight-transport.js";

const AGENT = "sotto-agent::1220agent";
const PAYER = "sotto-payer::1220payer";
const SYNCHRONIZER = "global-domain::1220sync";
const SUBJECT = "wallet-preflight-user";
const TOKEN = `header.${Buffer.from(JSON.stringify({ sub: SUBJECT })).toString(
  "base64url",
)}.signature`;
const PUBLIC_KEY = Buffer.alloc(32, 7).toString("base64");
const FINGERPRINT = `1220${"a".repeat(64)}` as `1220${string}`;
const TOPOLOGY_HASH = "topology-hash";
const TOPOLOGY_TRANSACTION = Buffer.from("topology").toString("base64");
const network = {
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
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

it("collects the exact read-only Five North wallet preflight", async () => {
  const requests: Array<
    Readonly<{ body?: unknown; method: string; path: string }>
  > = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ ...(body === undefined ? {} : { body }), method, path });
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    if (method === "GET" && path === "/v2/authenticated-user") {
      return json({ user: { id: SUBJECT } });
    }
    if (method === "GET" && path.endsWith("/rights")) {
      return json({
        rights: [
          { kind: { CanExecuteAs: { value: { party: AGENT } } } },
          { kind: { CanReadAs: { value: { party: AGENT } } } },
        ],
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
    if (
      method === "HEAD" &&
      [
        "/v2/interactive-submission/prepare",
        "/v2/interactive-submission/execute",
      ].includes(path)
    ) {
      return new Response(null, { status: 405 });
    }
    if (
      method === "POST" &&
      path === "/v2/parties/external/generate-topology"
    ) {
      return json({
        multiHash: TOPOLOGY_HASH,
        partyId: "sotto-preflight::1220proposed",
        publicKeyFingerprint: FINGERPRINT,
        topologyTransactions: [TOPOLOGY_TRANSACTION],
      });
    }
    throw new Error(`unexpected preflight route ${method} ${path}`);
  });
  const controller = new AbortController();
  const hashTopology = vi.fn(async () => TOPOLOGY_HASH);
  const transport = createFiveNorthWalletPreflightTransport(network, {
    createExternalPartyIdentity: async () => ({
      fingerprint: FINGERPRINT,
      hashTopology,
      publicKey: PUBLIC_KEY,
    }),
    fetcher,
    readReadiness: async () => ({
      packageVisible: true,
      preferredPackageConfirmed: true,
      synchronizerId: SYNCHRONIZER,
    }),
    signal: controller.signal,
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

  expect(result.verdict).toBe("SUPPORTED");
  expect(requests).toHaveLength(7);
  expect(requests).not.toContainEqual(
    expect.objectContaining({ path: "/v2/parties/external/allocate" }),
  );
  expect(requests).not.toContainEqual(
    expect.objectContaining({
      method: "POST",
      path: "/v2/interactive-submission/execute",
    }),
  );
  expect(requests.at(-1)).toMatchObject({
    body: {
      confirmationThreshold: 1,
      localParticipantObservationOnly: false,
      observingParticipantUids: [],
      otherConfirmingParticipantUids: [],
      publicKey: {
        format: "CRYPTO_KEY_FORMAT_RAW",
        keyData: PUBLIC_KEY,
        keySpec: "SIGNING_KEY_SPEC_EC_CURVE25519",
      },
      synchronizer: SYNCHRONIZER,
    },
    method: "POST",
    path: "/v2/parties/external/generate-topology",
  });
  expect((requests.at(-1)?.body as { partyHint: string }).partyHint).toMatch(
    /^sotto-wallet-preflight-[0-9a-f-]{36}$/u,
  );
  expect(hashTopology).toHaveBeenCalledWith([TOPOLOGY_TRANSACTION]);
  controller.abort();
});
