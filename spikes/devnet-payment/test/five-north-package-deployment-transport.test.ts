import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import { createFiveNorthPackageDeploymentTransport } from "../src/five-north-package-deployment-transport.js";

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
const synchronizerId = `global-domain::1220${"e".repeat(64)}`;

function tokenResponse(subject = "ledger-user-6"): Response {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

describe("Five North package deployment transport", () => {
  it("uses exact bounded read, no-vet validation and upload endpoints", async () => {
    const archive = new TextEncoder().encode("package archive");
    const packageId = createHash("sha256").update(archive).digest("hex");
    const dar = new TextEncoder().encode("production dar");
    const dispatchEvents: string[] = [];
    const requests: Array<
      Readonly<{ body: Uint8Array; method: string; url: string }>
    > = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) return tokenResponse();
      const candidateBody = init?.body;
      const body =
        candidateBody instanceof Uint8Array
          ? Uint8Array.from(candidateBody as Uint8Array)
          : new Uint8Array();
      requests.push({ body, method: String(init?.method), url });
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({
          amulet_rules: {
            contract: { payload: { dso: `DSO::1220${"d".repeat(64)}` } },
            domain_id: synchronizerId,
          },
        });
      }
      if (url.endsWith("/v2/packages")) {
        return Response.json({ packageIds: [packageId] });
      }
      if (url.endsWith(`/v2/packages/${packageId}`)) {
        return new Response(archive, {
          headers: {
            "Canton-Package-Hash": packageId,
            "Content-Type": "application/octet-stream",
          },
        });
      }
      if (url.includes("/v2/dars/validate?")) return new Response(null);
      if (url.includes("/v2/dars?vetAllPackages=false&")) {
        dispatchEvents.push("upload");
        return Response.json({});
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const transport = createFiveNorthPackageDeploymentTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    expect(Object.keys(transport).sort()).toEqual([
      "listPackageIds",
      "observeDeploymentAuthority",
      "readPackagePresence",
      "uploadDar",
      "validateDar",
    ]);
    await expect(transport.listPackageIds()).resolves.toEqual({
      packageIds: [packageId],
    });
    await expect(transport.readPackagePresence(packageId)).resolves.toEqual({
      archivePayloadSha256: packageId,
      packageId,
    });
    const authority = await transport.observeDeploymentAuthority();
    expect(authority).toMatchObject({ synchronizerId });
    expect(authority).not.toHaveProperty("userId");
    await transport.validateDar(dar, authority);
    await transport.uploadDar(dar, authority, async () => {
      dispatchEvents.push("marker");
    });
    expect(dispatchEvents).toEqual(["marker", "upload"]);

    const validation = requests.find((request) =>
      request.url.includes("/v2/dars/validate?"),
    );
    expect(validation).toMatchObject({ method: "POST" });
    expect(validation?.url).toBe(
      `${network.ledgerUrl}/v2/dars/validate?synchronizerId=${encodeURIComponent(synchronizerId)}`,
    );
    expect(validation?.body).toEqual(dar);
    const upload = requests.find((request) =>
      request.url.includes("/v2/dars?"),
    );
    expect(upload).toMatchObject({
      body: dar,
      method: "POST",
      url: `${network.ledgerUrl}/v2/dars?vetAllPackages=false&synchronizerId=${encodeURIComponent(synchronizerId)}`,
    });
    expect(upload?.url).not.toContain("vetAllPackages=true");
    expect(upload?.url).toContain("synchronizerId");
  });

  it("rejects malformed AmuletRules before DAR validation", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === network.tokenUrl
        ? tokenResponse()
        : Response.json({ amulet_rules: {} }),
    );
    const transport = createFiveNorthPackageDeploymentTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    await expect(transport.observeDeploymentAuthority()).rejects.toThrow(
      "AmuletRules",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never retries an upload after HTTP 401", async () => {
    let uploads = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({
          amulet_rules: { domain_id: synchronizerId },
        });
      }
      if (url.includes("/v2/dars/validate?")) return new Response(null);
      if (url.includes("/v2/dars?")) {
        uploads += 1;
        return new Response(null, { status: 401 });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const transport = createFiveNorthPackageDeploymentTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });
    const bytes = new TextEncoder().encode("production dar");
    const authority = await transport.observeDeploymentAuthority();
    await transport.validateDar(bytes, authority);

    await expect(
      transport.uploadDar(bytes, authority, async () => undefined),
    ).rejects.toThrow("HTTP 401");
    expect(uploads).toBe(1);
    await expect(
      transport.uploadDar(bytes, authority, async () => undefined),
    ).rejects.toThrow("matching validation");
    expect(uploads).toBe(1);
  });

  it("rejects forged authority and changed bytes before upload", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({
          amulet_rules: { domain_id: synchronizerId },
        });
      }
      if (url.includes("/v2/dars/validate?")) return new Response(null);
      if (url.includes("/v2/dars?")) return Response.json({});
      throw new Error(`unexpected request: ${url}`);
    });
    const transport = createFiveNorthPackageDeploymentTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });
    const bytes = new TextEncoder().encode("production dar");
    const authority = await transport.observeDeploymentAuthority();

    await expect(
      transport.validateDar(bytes, { ...authority }),
    ).rejects.toThrow("not authenticated");
    await transport.validateDar(bytes, authority);
    await expect(
      transport.uploadDar(
        new TextEncoder().encode("changed"),
        authority,
        async () => undefined,
      ),
    ).rejects.toThrow("matching validation");
    await transport.uploadDar(bytes, authority, async () => undefined);
  });

  it("rejects a refreshed token with a different subject before retrying validation", async () => {
    let tokenMints = 0;
    let validations = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) {
        tokenMints += 1;
        return tokenResponse(tokenMints === 1 ? "authority-a" : "authority-b");
      }
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({ amulet_rules: { domain_id: synchronizerId } });
      }
      if (url.includes("/v2/dars/validate?")) {
        validations += 1;
        return new Response(null, { status: 401 });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const transport = createFiveNorthPackageDeploymentTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });
    const authority = await transport.observeDeploymentAuthority();

    await expect(
      transport.validateDar(
        new TextEncoder().encode("production dar"),
        authority,
      ),
    ).rejects.toThrow(/identity/i);
    expect(tokenMints).toBe(2);
    expect(validations).toBe(1);
  });

  it("rejects an oversized DAR before validation or upload", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === network.tokenUrl) return tokenResponse();
      if (url.endsWith("/v0/scan-proxy/amulet-rules")) {
        return Response.json({ amulet_rules: { domain_id: synchronizerId } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const transport = createFiveNorthPackageDeploymentTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });
    const authority = await transport.observeDeploymentAuthority();

    await expect(
      transport.validateDar(new Uint8Array(16_777_217), authority),
    ).rejects.toThrow(/byte limit/i);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes("/v2/dars")),
    ).toHaveLength(0);
  });
});
