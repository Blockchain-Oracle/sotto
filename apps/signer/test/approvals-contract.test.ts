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
  const server = await buildServer(directory, {
    recomputePreparedHash: prepared.recompute,
  });
  cleanups.push(async () => {
    await server.close();
    rmSync(directory, { force: true, recursive: true });
  });
  return { directory, prepared, server, wallet };
}

function requestBody(
  wallet: Awaited<ReturnType<typeof provisionWallet>>,
  prepared: ReturnType<typeof preparedTransactionFixture>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    approvalSummary: approvalSummaryFor({
      fingerprint: wallet.fingerprint,
      partyId: wallet.partyId,
      preparedTransactionHash: prepared.hash,
    }),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    operationId: "op-1",
    preparedTransactionBase64: prepared.encoded,
    preparedTransactionHash: prepared.hash,
    requestCommitment: hash("request"),
    walletId: wallet.walletId,
    ...overrides,
  };
}

async function post(server: FastifyInstance, payload: Record<string, unknown>) {
  return server.inject({
    headers: bearer(),
    method: "POST",
    payload,
    url: "/internal/approvals",
  });
}

describe("approval submission contract", () => {
  it("accepts a verified approval and returns the wallet approval URL", async () => {
    const { prepared, server, wallet } = await harness();
    const response = await post(server, requestBody(wallet, prepared));
    expect(response.statusCode).toBe(201);
    const body = response.json() as { approvalId: string; approvalUrl: string };
    expect(body.approvalId).toMatch(/^[0-9a-f]{32}$/u);
    expect(body.approvalUrl).toBe(
      `http://127.0.0.1:4402/approve/${body.approvalId}`,
    );
  });

  it("independently recomputes the prepared hash and rejects a mismatch", async () => {
    const { prepared, server, wallet } = await harness();
    const wrongHash = hash("not-the-prepared-transaction");
    const summary = approvalSummaryFor({
      fingerprint: wallet.fingerprint,
      partyId: wallet.partyId,
      preparedTransactionHash: wrongHash,
    });
    const response = await post(
      server,
      requestBody(wallet, prepared, {
        approvalSummary: summary,
        preparedTransactionHash: wrongHash,
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "prepared-hash-mismatch" });
  });

  it("rejects when the recompute itself fails", async () => {
    const directory = temporaryKeyDirectory();
    const wallet = await provisionWallet(directory);
    const prepared = preparedTransactionFixture();
    const server = await buildServer(directory, {
      recomputePreparedHash: () => Promise.reject(new Error("decode failed")),
    });
    cleanups.push(async () => {
      await server.close();
      rmSync(directory, { force: true, recursive: true });
    });
    const response = await post(server, requestBody(wallet, prepared));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "prepared-hash-unverifiable" });
  });

  it("rejects a summary that is not a valid v2 approval record", async () => {
    const { prepared, server, wallet } = await harness();
    const summary = approvalSummaryFor({
      fingerprint: wallet.fingerprint,
      partyId: wallet.partyId,
      preparedTransactionHash: prepared.hash,
    });
    summary.asset = "USD";
    const response = await post(
      server,
      requestBody(wallet, prepared, { approvalSummary: summary }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "approval-summary-invalid" });
  });

  it("rejects a request commitment that disagrees with the summary", async () => {
    const { prepared, server, wallet } = await harness();
    const response = await post(
      server,
      requestBody(wallet, prepared, {
        requestCommitment: hash("different-request"),
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "request-commitment-mismatch" });
  });

  it("refuses to sign for a key the wallet does not hold", async () => {
    const { directory, prepared, server } = await harness();
    const other = await provisionWallet(directory);
    const summary = approvalSummaryFor({
      fingerprint: other.fingerprint,
      partyId: other.partyId,
      preparedTransactionHash: prepared.hash,
    });
    const first = await provisionWallet(directory);
    const response = await post(
      server,
      requestBody(first, prepared, { approvalSummary: summary }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "wallet-key-mismatch" });
  });

  it("rejects a duplicate operation ID exactly once", async () => {
    const { prepared, server, wallet } = await harness();
    const first = await post(server, requestBody(wallet, prepared));
    expect(first.statusCode).toBe(201);
    const second = await post(server, requestBody(wallet, prepared));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "operation-already-submitted" });
  });

  it("rejects an expiry beyond the ledger execute-before deadline", async () => {
    const { prepared, server, wallet } = await harness();
    const response = await post(
      server,
      requestBody(wallet, prepared, {
        expiresAt: new Date(Date.now() + 7_200_000).toISOString(),
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "expiry-invalid" });
  });

  it("returns 404 for an unknown wallet", async () => {
    const { prepared, server, wallet } = await harness();
    const response = await post(
      server,
      requestBody(wallet, prepared, { walletId: "0".repeat(32) }),
    );
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "wallet-unknown" });
  });
});
