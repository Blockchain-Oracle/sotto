import { describe, expect, it } from "vitest";
import { createSignerWalletClient } from "../src/signer-client.js";

const BASE = "https://wallet.example.invalid";
const TOKEN = "signer-token-signer-token-signer-token-32";

function response(status: number, body: string, contentType: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

describe("signer wallet client — gateway failures never throw", () => {
  it("maps a non-JSON 502 (proxy error page) to a readable upstream error", async () => {
    const client = createSignerWalletClient({
      baseUrl: BASE,
      token: TOKEN,
      fetcher: async () =>
        response(502, "error code: 502", "text/plain; charset=UTF-8"),
    });
    const result = await client.createWallet("judge", {
      signal: AbortSignal.timeout(1_000),
    });
    expect(result.status).toBe(502);
    expect(result.body.error).toBe("wallet-service-unavailable");
    expect(String(result.body.detail)).toContain("HTTP 502");
  });

  it("maps a transport failure to a 503 the route can pass through", async () => {
    const client = createSignerWalletClient({
      baseUrl: BASE,
      token: TOKEN,
      fetcher: async () => {
        throw new Error("connection refused");
      },
    });
    const result = await client.fundWallet("wallet-1", {
      signal: AbortSignal.timeout(1_000),
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("wallet-service-unreachable");
  });

  it("still returns a real JSON body unchanged on success", async () => {
    const client = createSignerWalletClient({
      baseUrl: BASE,
      token: TOKEN,
      fetcher: async () =>
        response(
          201,
          JSON.stringify({ walletId: "w1", partyId: "sotto::1220" }),
          "application/json",
        ),
    });
    const result = await client.createWallet("judge", {
      signal: AbortSignal.timeout(1_000),
    });
    expect(result.status).toBe(201);
    expect(result.body.partyId).toBe("sotto::1220");
  });
});
