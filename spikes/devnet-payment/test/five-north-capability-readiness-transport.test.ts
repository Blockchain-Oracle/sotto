import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFiveNorthCapabilityReadinessTransport } from "../src/five-north-capability-readiness-transport.js";
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
const payer = `sotto-payer::1220${"a".repeat(64)}`;
const agent = `sotto-agent::1220${"b".repeat(64)}`;

function tokenResponse(subject = "ledger-user-6"): Response {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

describe("Five North capability readiness transport", () => {
  it("exposes only authenticated discovery reads", () => {
    const transport = createFiveNorthCapabilityReadinessTransport(network, {
      fetcher: vi.fn(async () => tokenResponse()),
      signal: new AbortController().signal,
    });

    expect(Object.keys(transport).sort()).toEqual([
      "readAmuletRules",
      "readAuthenticatedUserId",
      "readPackagePresence",
      "readPreferredSottoPackage",
    ]);
    expect(transport).not.toHaveProperty("submit");
    expect(transport).not.toHaveProperty("sign");
  });

  it("pins package bytes and preferred parties", async () => {
    const payload = new TextEncoder().encode("test package payload");
    const packageId = createHash("sha256").update(payload).digest("hex");
    const requests: Array<
      Readonly<{ body: unknown; method: string; url: string }>
    > = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) return tokenResponse();
      requests.push({
        body: init?.body === undefined ? null : JSON.parse(String(init.body)),
        method: String(init?.method),
        url,
      });
      if (url.endsWith(`/v2/packages/${packageId}`)) {
        return new Response(payload, {
          headers: { "Canton-Package-Hash": packageId },
        });
      }
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({ amulet_rules: {} });
      }
      return Response.json([]);
    });
    const transport = createFiveNorthCapabilityReadinessTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    await expect(transport.readAuthenticatedUserId()).resolves.toBe(
      "ledger-user-6",
    );
    await expect(transport.readAmuletRules()).resolves.toEqual({
      amulet_rules: {},
    });
    await expect(transport.readPackagePresence(packageId)).resolves.toEqual({
      archivePayloadSha256: packageId,
      packageId,
    });
    await transport.readPreferredSottoPackage(payer, agent);

    expect(JSON.stringify(requests[2])).toContain("sotto-control");
    expect(JSON.stringify(requests[2])).toContain(payer);
    expect(JSON.stringify(requests[2])).toContain(agent);
  });

  it("rejects invalid IDs and package header or payload mismatch", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      return new Response("wrong bytes", {
        headers: { "Canton-Package-Hash": "0".repeat(64) },
      });
    });
    const transport = createFiveNorthCapabilityReadinessTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    await expect(transport.readPackagePresence("bad")).rejects.toThrow(
      "lowercase SHA-256",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(transport.readPackagePresence("1".repeat(64))).rejects.toThrow(
      "header does not match",
    );

    const payloadTransport = createFiveNorthCapabilityReadinessTransport(
      network,
      {
        fetcher: vi.fn(async (url: string) =>
          url === network.tokenUrl
            ? tokenResponse()
            : new Response("wrong bytes", {
                headers: { "Canton-Package-Hash": "2".repeat(64) },
              }),
        ),
        signal: new AbortController().signal,
      },
    );
    await expect(
      payloadTransport.readPackagePresence("2".repeat(64)),
    ).rejects.toThrow("payload hash does not match");
  });
});
