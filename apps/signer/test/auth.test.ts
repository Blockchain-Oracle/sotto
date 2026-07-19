import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  approvalSummaryFor,
  bearer,
  buildServer,
  hash,
  preparedTransactionFixture,
  provisionWallet,
  sessionCookieFor,
  temporaryKeyDirectory,
} from "./fixtures.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function harness() {
  const directory = temporaryKeyDirectory();
  const prepared = preparedTransactionFixture();
  const server = await buildServer(directory, {
    recomputePreparedHash: prepared.recompute,
  });
  cleanups.push(async () => {
    await server.close();
    rmSync(directory, { force: true, recursive: true });
  });
  return { directory, prepared, server };
}

describe("service token guard", () => {
  it.each([
    ["without a token", {}],
    ["with a wrong token", { authorization: "Bearer wrong-token" }],
    ["with a malformed header", { authorization: "Token abc" }],
  ])("rejects internal calls %s", async (_label, headers) => {
    const { server } = await harness();
    for (const [method, url] of [
      ["POST", "/internal/approvals"],
      ["GET", `/internal/approvals/${"0".repeat(32)}`],
      ["POST", "/internal/wallets"],
      ["POST", `/internal/wallets/${"0".repeat(32)}/fund`],
      ["POST", `/internal/wallets/${"0".repeat(32)}/link`],
    ] as const) {
      const response = await server.inject({ headers, method, url });
      expect(`${method} ${url} ${response.statusCode}`).toBe(
        `${method} ${url} 401`,
      );
      expect(response.json()).toEqual({ error: "service-token-required" });
    }
  });

  it("never guards the wallet-facing surface with the service token", async () => {
    const { server } = await harness();
    const response = await server.inject({ method: "GET", url: "/wallet" });
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain("Wallet session required");
  });
});

describe("wallet session isolation", () => {
  async function sessionFor(
    server: Awaited<ReturnType<typeof harness>>["server"],
    walletId: string,
  ): Promise<string> {
    const link = await server.inject({
      headers: bearer(),
      method: "POST",
      url: `/internal/wallets/${walletId}/link`,
    });
    const token = (link.json() as { linkUrl: string }).linkUrl
      .split("/")
      .at(-1);
    const claimed = await server.inject({
      method: "GET",
      url: `/link/${token}`,
    });
    const setCookie = claimed.headers["set-cookie"];
    return sessionCookieFor(
      (Array.isArray(setCookie) ? setCookie[0] : setCookie) as string,
    );
  }

  it("hides another wallet's approvals from a session", async () => {
    const { directory, prepared, server } = await harness();
    const owner = await provisionWallet(directory);
    const outsider = await provisionWallet(directory);
    const created = await server.inject({
      headers: bearer(),
      method: "POST",
      payload: {
        approvalSummary: approvalSummaryFor({
          fingerprint: owner.fingerprint,
          partyId: owner.partyId,
          preparedTransactionHash: prepared.hash,
        }),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        operationId: "op-isolation",
        preparedTransactionBase64: prepared.encoded,
        preparedTransactionHash: prepared.hash,
        requestCommitment: hash("request"),
        walletId: owner.walletId,
      },
      url: "/internal/approvals",
    });
    expect(created.statusCode).toBe(201);
    const approvalId = (created.json() as { approvalId: string }).approvalId;

    const outsiderCookie = await sessionFor(server, outsider.walletId);
    const page = await server.inject({
      headers: { cookie: outsiderCookie },
      method: "GET",
      url: `/approve/${approvalId}`,
    });
    expect(page.statusCode).toBe(404);
    const approve = await server.inject({
      headers: { cookie: outsiderCookie },
      method: "POST",
      url: `/approve/${approvalId}/approve`,
    });
    expect(approve.statusCode).toBe(404);
    const home = await server.inject({
      headers: { cookie: outsiderCookie },
      method: "GET",
      url: "/wallet",
    });
    expect(home.body).not.toContain(approvalId);

    const ownerCookie = await sessionFor(server, owner.walletId);
    const ownerHome = await server.inject({
      headers: { cookie: ownerCookie },
      method: "GET",
      url: "/wallet",
    });
    expect(ownerHome.body).toContain(approvalId);
  });

  it("treats a wallet link as one-use", async () => {
    const { directory, server } = await harness();
    const wallet = await provisionWallet(directory);
    const link = await server.inject({
      headers: bearer(),
      method: "POST",
      url: `/internal/wallets/${wallet.walletId}/link`,
    });
    const token = (link.json() as { linkUrl: string }).linkUrl
      .split("/")
      .at(-1);
    const first = await server.inject({ method: "GET", url: `/link/${token}` });
    expect(first.statusCode).toBe(303);
    const second = await server.inject({
      method: "GET",
      url: `/link/${token}`,
    });
    expect(second.statusCode).toBe(410);
  });

  it("rejects a tampered session cookie", async () => {
    const { directory, server } = await harness();
    await provisionWallet(directory);
    const forged = `sotto_wallet_session=${encodeURIComponent(
      `${JSON.stringify({ expiresAt: Date.now() + 60_000, walletId: "0".repeat(32) })}.forged`,
    )}`;
    const response = await server.inject({
      headers: { cookie: forged },
      method: "GET",
      url: "/wallet",
    });
    expect(response.statusCode).toBe(401);
  });
});
