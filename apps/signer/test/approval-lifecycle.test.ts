import { rmSync } from "node:fs";
import type { FastifyInstance } from "fastify";
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
  const wallet = await provisionWallet(directory);
  const prepared = preparedTransactionFixture();
  const clock = { t: Date.now() };
  const server = await buildServer(directory, {
    now: () => clock.t,
    recomputePreparedHash: prepared.recompute,
  });
  cleanups.push(async () => {
    await server.close();
    rmSync(directory, { force: true, recursive: true });
  });
  return { clock, directory, prepared, server, wallet };
}

async function createApproval(
  server: FastifyInstance,
  wallet: Awaited<ReturnType<typeof provisionWallet>>,
  prepared: ReturnType<typeof preparedTransactionFixture>,
  operationId: string,
  expiresAt: string,
): Promise<string> {
  const response = await server.inject({
    headers: bearer(),
    method: "POST",
    payload: {
      approvalSummary: approvalSummaryFor({
        fingerprint: wallet.fingerprint,
        partyId: wallet.partyId,
        preparedTransactionHash: prepared.hash,
      }),
      expiresAt,
      operationId,
      preparedTransactionBase64: prepared.encoded,
      preparedTransactionHash: prepared.hash,
      requestCommitment: hash("request"),
      walletId: wallet.walletId,
    },
    url: "/internal/approvals",
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { approvalId: string }).approvalId;
}

async function walletSession(
  server: FastifyInstance,
  walletId: string,
): Promise<string> {
  const link = await server.inject({
    headers: bearer(),
    method: "POST",
    url: `/internal/wallets/${walletId}/link`,
  });
  expect(link.statusCode).toBe(201);
  const linkUrl = (link.json() as { linkUrl: string }).linkUrl;
  const token = linkUrl.split("/").at(-1);
  const claimed = await server.inject({ method: "GET", url: `/link/${token}` });
  expect(claimed.statusCode).toBe(303);
  expect(claimed.headers.location).toBe("/wallet");
  const setCookie = claimed.headers["set-cookie"];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(header).toContain("sotto_wallet_session=");
  expect(header).toContain("HttpOnly");
  return sessionCookieFor(header as string);
}

describe("approval lifecycle", () => {
  it("walks pending, approval page, signing, and one-use collection", async () => {
    const { clock, prepared, server, wallet } = await harness();
    const expiresAt = new Date(clock.t + 300_000).toISOString();
    const approvalId = await createApproval(
      server,
      wallet,
      prepared,
      "op-lifecycle",
      expiresAt,
    );

    const pending = await server.inject({
      headers: bearer(),
      method: "GET",
      url: `/internal/approvals/${approvalId}`,
    });
    expect(pending.json()).toEqual({ expiresAt, state: "pending" });

    const cookie = await walletSession(server, wallet.walletId);
    const home = await server.inject({
      headers: { cookie },
      method: "GET",
      url: "/wallet",
    });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain(`/approve/${approvalId}`);

    const page = await server.inject({
      headers: { cookie },
      method: "GET",
      url: `/approve/${approvalId}`,
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Pending");
    expect(page.body).toContain(
      "This signature authorizes exactly this payment.",
    );
    expect(page.body).toContain("merchant::provider-party");
    expect(page.body).toContain("1.2500000000 CC");
    expect(page.body).toContain("splice-amulet");
    expect(page.body).not.toContain("does not move funds");

    const approve = await server.inject({
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      payload: "",
      url: `/approve/${approvalId}/approve`,
    });
    expect(approve.statusCode).toBe(303);

    const decided = await server.inject({
      headers: { cookie },
      method: "GET",
      url: `/approve/${approvalId}`,
    });
    expect(decided.body).toContain("Approved");

    const collected = await server.inject({
      headers: bearer(),
      method: "GET",
      url: `/internal/approvals/${approvalId}`,
    });
    const first = collected.json() as {
      collectedAt: string;
      signature?: { format: string; signatureBase64: string; signedBy: string };
      state: string;
    };
    expect(first.state).toBe("approved");
    expect(first.signature?.format).toBe("SIGNATURE_FORMAT_CONCAT");
    expect(first.signature?.signedBy).toBe(wallet.fingerprint);
    expect(first.signature?.signatureBase64).toMatch(/^[A-Za-z0-9+/]+=*$/u);
    expect(first.collectedAt).toBeDefined();

    const again = await server.inject({
      headers: bearer(),
      method: "GET",
      url: `/internal/approvals/${approvalId}`,
    });
    const second = again.json() as Record<string, unknown>;
    expect(second.state).toBe("approved");
    expect(second.signature).toBeUndefined();
    expect(second.collectedAt).toBeDefined();
  });

  it("records a rejection without producing a signature", async () => {
    const { clock, prepared, server, wallet } = await harness();
    const approvalId = await createApproval(
      server,
      wallet,
      prepared,
      "op-reject",
      new Date(clock.t + 300_000).toISOString(),
    );
    const cookie = await walletSession(server, wallet.walletId);
    const reject = await server.inject({
      headers: { cookie },
      method: "POST",
      url: `/approve/${approvalId}/reject`,
    });
    expect(reject.statusCode).toBe(303);
    const state = await server.inject({
      headers: bearer(),
      method: "GET",
      url: `/internal/approvals/${approvalId}`,
    });
    const body = state.json() as Record<string, unknown>;
    expect(body.state).toBe("rejected");
    expect(body.signature).toBeUndefined();
    expect(body.decidedAt).toBeDefined();
  });

  it("expires an undecided approval and refuses late approval", async () => {
    const { clock, prepared, server, wallet } = await harness();
    const approvalId = await createApproval(
      server,
      wallet,
      prepared,
      "op-expiry",
      new Date(clock.t + 60_000).toISOString(),
    );
    const cookie = await walletSession(server, wallet.walletId);
    clock.t += 120_000;
    const state = await server.inject({
      headers: bearer(),
      method: "GET",
      url: `/internal/approvals/${approvalId}`,
    });
    expect((state.json() as { state: string }).state).toBe("expired");
    const approve = await server.inject({
      headers: { cookie },
      method: "POST",
      url: `/approve/${approvalId}/approve`,
    });
    expect(approve.statusCode).toBe(303);
    const after = await server.inject({
      headers: bearer(),
      method: "GET",
      url: `/internal/approvals/${approvalId}`,
    });
    const body = after.json() as Record<string, unknown>;
    expect(body.state).toBe("expired");
    expect(body.signature).toBeUndefined();
  });
});
