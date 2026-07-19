import { createServer, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSignerClient, type SignerClient } from "../src/signer-client.js";

const TOKEN = "signer-contract-token";
const SIGNATURE = {
  format: "SIGNATURE_FORMAT_CONCAT",
  signedBy: `1220${"a".repeat(64)}`,
  signatureBase64: Buffer.alloc(64, 3).toString("base64"),
};

type ApprovalRecord = {
  body: unknown;
  reads: number;
  script: ReadonlyArray<Record<string, unknown>>;
  signatureCollected: boolean;
};

let server: Server;
let client: SignerClient;
let baseUrl: string;
const approvals = new Map<string, ApprovalRecord>();
const requests: Array<{ method: string; url: string; authorization: string }> =
  [];
let nextScript: ReadonlyArray<Record<string, unknown>> = [];

function respond(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json" });
  response.end(payload);
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: request.headers.authorization ?? "",
      });
      if (request.headers.authorization !== `Bearer ${TOKEN}`) {
        respond(response, 401, { error: "unauthorized" });
        return;
      }
      if (request.method === "POST" && request.url === "/internal/approvals") {
        const approvalId = `approval-${approvals.size + 1}`;
        approvals.set(approvalId, {
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          reads: 0,
          script: nextScript,
          signatureCollected: false,
        });
        respond(response, 201, {
          approvalId,
          approvalUrl: `${baseUrl}/approvals/${approvalId}`,
        });
        return;
      }
      const match = /^\/internal\/approvals\/([^/]+)$/u.exec(request.url ?? "");
      if (request.method === "GET" && match !== null) {
        if (match[1] === "oversized") {
          respond(response, 200, {
            state: "pending",
            padding: "x".repeat(70_000),
          });
          return;
        }
        const record = approvals.get(match[1]!);
        if (record === undefined) {
          respond(response, 404, { error: "unknown approval" });
          return;
        }
        const scripted =
          record.script[Math.min(record.reads, record.script.length - 1)]!;
        record.reads += 1;
        if (scripted.state === "approved") {
          if (record.signatureCollected) {
            respond(response, 200, {
              state: "approved",
              decidedAt: scripted.decidedAt,
              collectedAt: "2026-07-19T10:00:05.000Z",
            });
            return;
          }
          record.signatureCollected = true;
          respond(response, 200, {
            state: "approved",
            decidedAt: scripted.decidedAt,
            signature: SIGNATURE,
          });
          return;
        }
        respond(response, 200, scripted);
        return;
      }
      respond(response, 404, { error: "unknown route" });
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("signer contract server did not bind");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  client = createSignerClient({ baseUrl, token: TOKEN });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function approvalRequest() {
  return Object.freeze({
    operationId: `sha256:${"b".repeat(64)}`,
    walletId: "sotto-external-payer::1220payer",
    approvalSummary: { version: "sotto-human-purchase-approval-v2" },
    preparedTransactionBase64: Buffer.alloc(48, 5).toString("base64"),
    preparedTransactionHash: `sha256:${"c".repeat(64)}`,
    requestCommitment: `sha256:${"d".repeat(64)}`,
    expiresAt: "2026-07-19T10:10:00.000Z",
  });
}

describe("signer service HTTP contract", () => {
  it("creates approvals with bearer auth against the fixed route", async () => {
    nextScript = [{ state: "pending" }];
    const created = await client.createApproval(approvalRequest(), {
      signal: new AbortController().signal,
    });
    expect(created.approvalId).toMatch(/^approval-/u);
    expect(created.approvalUrl).toContain(created.approvalId);
    const create = requests.at(-1)!;
    expect(create).toMatchObject({
      method: "POST",
      url: "/internal/approvals",
      authorization: `Bearer ${TOKEN}`,
    });
    expect(approvals.get(created.approvalId)?.body).toEqual(approvalRequest());
  });

  it("reads pending then approved and collects the signature once", async () => {
    nextScript = [
      { state: "pending" },
      { state: "approved", decidedAt: "2026-07-19T10:00:04.000Z" },
    ];
    const { approvalId } = await client.createApproval(approvalRequest(), {
      signal: new AbortController().signal,
    });
    const signal = new AbortController().signal;
    await expect(client.readApproval(approvalId, { signal })).resolves.toEqual({
      state: "pending",
    });
    const approved = await client.readApproval(approvalId, { signal });
    expect(approved).toEqual({
      state: "approved",
      decidedAt: "2026-07-19T10:00:04.000Z",
      signature: SIGNATURE,
    });
    const collected = await client.readApproval(approvalId, { signal });
    expect(collected.state).toBe("approved");
    expect(collected.signature).toBeUndefined();
  });

  it("reports rejections without any signature", async () => {
    nextScript = [{ state: "rejected", decidedAt: "2026-07-19T10:00:06.000Z" }];
    const { approvalId } = await client.createApproval(approvalRequest(), {
      signal: new AbortController().signal,
    });
    await expect(
      client.readApproval(approvalId, { signal: new AbortController().signal }),
    ).resolves.toEqual({
      state: "rejected",
      decidedAt: "2026-07-19T10:00:06.000Z",
    });
  });

  it("fails closed on wrong tokens, unknown approvals, and byte floods", async () => {
    const signal = new AbortController().signal;
    const wrongToken = createSignerClient({ baseUrl, token: "wrong-token" });
    await expect(
      wrongToken.createApproval(approvalRequest(), { signal }),
    ).rejects.toThrowError("signer approval creation returned 401");
    await expect(
      client.readApproval("missing-approval", { signal }),
    ).rejects.toThrowError("signer approval read returned 404");
    await expect(
      client.readApproval("oversized", { signal }),
    ).rejects.toThrowError("signer response exceeds its byte boundary");
  });

  it("honors aborts before sending", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.readApproval("approval-1", { signal: controller.signal }),
    ).rejects.toThrowError("signer request cancelled");
  });
});
