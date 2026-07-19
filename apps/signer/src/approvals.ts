import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { parseReferenceHumanWalletApproval } from "@sotto/capability-wallet";
import type { HumanPreparedPurchaseApproval } from "@sotto/x402-canton";
import { approvalRuntimeState } from "./approval-store.js";
import type { SignerContext } from "./context.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const OPERATION_ID = /^[\x21-\x7e]{1,128}$/u;
const MAX_PREPARED_BYTES = 2 * 1024 * 1024;

type CreateApprovalBody = Readonly<{
  approvalSummary: unknown;
  expiresAt: string;
  operationId: string;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  walletId: string;
}>;

function fail(reply: FastifyReply, statusCode: number, error: string): null {
  void reply.status(statusCode).send({ error });
  return null;
}

function exactIsoTime(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    return undefined;
  }
  return value;
}

function parseCreateBody(
  body: unknown,
  reply: FastifyReply,
): CreateApprovalBody | null {
  if (typeof body !== "object" || body === null) {
    return fail(reply, 400, "approval-request-invalid");
  }
  const record = body as Record<string, unknown>;
  const operationId = record.operationId;
  const walletId = record.walletId;
  const encoded = record.preparedTransactionBase64;
  const preparedTransactionHash = record.preparedTransactionHash;
  const requestCommitment = record.requestCommitment;
  const expiresAt = exactIsoTime(record.expiresAt);
  if (
    typeof operationId !== "string" ||
    !OPERATION_ID.test(operationId) ||
    typeof walletId !== "string" ||
    typeof preparedTransactionHash !== "string" ||
    !HASH.test(preparedTransactionHash) ||
    typeof requestCommitment !== "string" ||
    !HASH.test(requestCommitment) ||
    expiresAt === undefined ||
    record.approvalSummary === undefined
  ) {
    return fail(reply, 400, "approval-request-invalid");
  }
  if (
    typeof encoded !== "string" ||
    encoded === "" ||
    !BASE64.test(encoded) ||
    Buffer.from(encoded, "base64").toString("base64") !== encoded
  ) {
    return fail(reply, 400, "approval-request-invalid");
  }
  const preparedTransaction = new Uint8Array(Buffer.from(encoded, "base64"));
  if (
    preparedTransaction.byteLength === 0 ||
    preparedTransaction.byteLength > MAX_PREPARED_BYTES
  ) {
    return fail(reply, 400, "approval-request-invalid");
  }
  return {
    approvalSummary: record.approvalSummary,
    expiresAt,
    operationId,
    preparedTransaction,
    preparedTransactionHash: preparedTransactionHash as `sha256:${string}`,
    requestCommitment: requestCommitment as `sha256:${string}`,
    walletId,
  };
}

async function verifyPreparedHash(
  context: SignerContext,
  body: CreateApprovalBody,
  reply: FastifyReply,
): Promise<boolean> {
  let computed: Uint8Array;
  try {
    computed = await context.recomputePreparedHash(body.preparedTransaction);
  } catch {
    fail(reply, 400, "prepared-hash-unverifiable");
    return false;
  }
  const expected = Buffer.from(body.preparedTransactionHash.slice(7), "hex");
  if (
    computed.byteLength !== 32 ||
    !timingSafeEqual(Buffer.from(computed), expected)
  ) {
    fail(reply, 400, "prepared-hash-mismatch");
    return false;
  }
  return true;
}

export function registerApprovalRoutes(
  server: FastifyInstance,
  context: SignerContext,
): void {
  server.post("/internal/approvals", async (request, reply) => {
    const body = parseCreateBody(request.body, reply);
    if (body === null) return;
    const wallet = await context.wallets.read(body.walletId);
    if (wallet === undefined) return fail(reply, 404, "wallet-unknown");
    if (!(await verifyPreparedHash(context, body, reply))) return;
    let approval: HumanPreparedPurchaseApproval;
    try {
      approval = parseReferenceHumanWalletApproval(
        body.approvalSummary,
        body.preparedTransactionHash,
      );
    } catch {
      return fail(reply, 400, "approval-summary-invalid");
    }
    if (approval.requestCommitment !== body.requestCommitment) {
      return fail(reply, 400, "request-commitment-mismatch");
    }
    if (approval.signer.publicKeyFingerprint !== wallet.fingerprint) {
      return fail(reply, 403, "wallet-key-mismatch");
    }
    if (
      wallet.partyId !== undefined &&
      approval.payerParty !== wallet.partyId
    ) {
      return fail(reply, 403, "wallet-party-mismatch");
    }
    const expires = Date.parse(body.expiresAt);
    if (
      expires <= context.now() ||
      expires > Date.parse(approval.executeBefore)
    ) {
      return fail(reply, 400, "expiry-invalid");
    }
    const record = await context.approvals.create({
      approval,
      expiresAt: body.expiresAt,
      operationId: body.operationId,
      preparedTransactionHash: body.preparedTransactionHash,
      requestCommitment: body.requestCommitment,
      walletId: body.walletId,
    });
    if (record === "operation-already-submitted") {
      return fail(reply, 409, "operation-already-submitted");
    }
    return reply.status(201).send({
      approvalId: record.approvalId,
      approvalUrl: `${context.env.publicWalletOrigin}/approve/${record.approvalId}`,
    });
  });

  server.get("/internal/approvals/:approvalId", async (request, reply) => {
    const { approvalId } = request.params as Readonly<{ approvalId: string }>;
    const record = await context.approvals.read(approvalId);
    if (record === undefined) return fail(reply, 404, "approval-unknown");
    const state = approvalRuntimeState(record, context.now());
    if (state === "pending" || state === "expired") {
      return reply.send({ expiresAt: record.expiresAt, state });
    }
    if (state === "rejected") {
      return reply.send({ decidedAt: record.decidedAt, state });
    }
    if (record.signature !== undefined) {
      const signature = await context.approvals.collectSignature(record);
      const collected = await context.approvals.read(record.approvalId);
      return reply.send({
        collectedAt: collected?.collectedAt,
        decidedAt: record.decidedAt,
        signature: {
          format: signature.signatureFormat,
          signatureBase64: signature.signatureBase64,
          signedBy: signature.signedBy,
        },
        state,
      });
    }
    return reply.send({
      collectedAt: record.collectedAt,
      decidedAt: record.decidedAt,
      state,
    });
  });
}
