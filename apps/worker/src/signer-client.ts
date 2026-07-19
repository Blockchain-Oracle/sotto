const MAX_RESPONSE_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 10_000;
const SIGNER_STATES = new Set(["pending", "approved", "rejected", "expired"]);

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type SignerApprovalRequest = Readonly<{
  operationId: string;
  walletId: string;
  approvalSummary: unknown;
  preparedTransactionBase64: string;
  preparedTransactionHash: string;
  requestCommitment: string;
  expiresAt: string;
}>;

export type SignerApprovalCreated = Readonly<{
  approvalId: string;
  approvalUrl: string;
}>;

export type SignerSignature = Readonly<{
  format: string;
  signedBy: string;
  signatureBase64: string;
}>;

export type SignerApprovalState = Readonly<{
  state: "pending" | "approved" | "rejected" | "expired";
  signature?: SignerSignature;
  decidedAt?: string;
}>;

export type SignerClient = Readonly<{
  createApproval(
    request: SignerApprovalRequest,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerApprovalCreated>;
  readApproval(
    approvalId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerApprovalState>;
}>;

export type SignerClientInput = Readonly<{
  baseUrl: string;
  token: string;
  fetcher?: Fetcher;
}>;

function boundedText(value: unknown, label: string, maximum = 2_048): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximum
  ) {
    throw new Error(`signer ${label} is invalid`);
  }
  return value;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("signer response exceeds its byte boundary");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("signer response body is absent");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("signer response exceeds its byte boundary");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("signer response is not valid JSON");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`signer ${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function parseApprovalState(value: unknown): SignerApprovalState {
  const body = record(value, "approval state");
  const state = body.state;
  if (typeof state !== "string" || !SIGNER_STATES.has(state)) {
    throw new Error("signer approval state is invalid");
  }
  const result: {
    state: SignerApprovalState["state"];
    signature?: SignerSignature;
    decidedAt?: string;
  } = { state: state as SignerApprovalState["state"] };
  if (body.signature !== undefined) {
    const signature = record(body.signature, "signature");
    result.signature = Object.freeze({
      format: boundedText(signature.format, "signature format", 128),
      signedBy: boundedText(signature.signedBy, "signature signedBy", 256),
      signatureBase64: boundedText(
        signature.signatureBase64,
        "signature bytes",
        16_384,
      ),
    });
  }
  if (body.decidedAt !== undefined) {
    result.decidedAt = boundedText(body.decidedAt, "decision time", 64);
  }
  return Object.freeze(result);
}

/**
 * HTTP client for the parallel-built signer service. The contract is fixed:
 * `POST /internal/approvals` (201) creates one approval handoff and
 * `GET /internal/approvals/:approvalId` reports the decision; an approved
 * signature is collectable exactly once. All reads are byte-bounded and
 * abort-aware; the bearer token never appears in errors.
 */
export function createSignerClient(input: SignerClientInput): SignerClient {
  const baseUrl = boundedText(input.baseUrl, "service URL").replace(/\/$/u, "");
  const token = boundedText(input.token, "service token", 4_096);
  const fetcher = input.fetcher ?? fetch;

  async function send(
    path: string,
    init: Readonly<{ method: "GET" | "POST"; body?: string }>,
    signal: AbortSignal,
  ): Promise<Response> {
    if (signal.aborted) throw new Error("signer request cancelled");
    try {
      return await fetcher(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        redirect: "error",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
    } catch {
      throw new Error("signer service transport failed");
    }
  }

  return Object.freeze({
    createApproval: async (request, { signal }) => {
      const body = JSON.stringify({
        operationId: boundedText(request.operationId, "operation ID"),
        walletId: boundedText(request.walletId, "wallet ID"),
        approvalSummary: request.approvalSummary,
        preparedTransactionBase64: boundedText(
          request.preparedTransactionBase64,
          "prepared transaction",
          262_144,
        ),
        preparedTransactionHash: boundedText(
          request.preparedTransactionHash,
          "prepared transaction hash",
        ),
        requestCommitment: boundedText(
          request.requestCommitment,
          "request commitment",
        ),
        expiresAt: boundedText(request.expiresAt, "expiry", 64),
      });
      const response = await send(
        "/internal/approvals",
        { method: "POST", body },
        signal,
      );
      if (response.status !== 201) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`signer approval creation returned ${response.status}`);
      }
      const created = record(
        await readBoundedJson(response),
        "approval creation",
      );
      return Object.freeze({
        approvalId: boundedText(created.approvalId, "approval ID"),
        approvalUrl: boundedText(created.approvalUrl, "approval URL"),
      });
    },
    readApproval: async (approvalId, { signal }) => {
      const identifier = boundedText(approvalId, "approval ID");
      const response = await send(
        `/internal/approvals/${encodeURIComponent(identifier)}`,
        { method: "GET" },
        signal,
      );
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`signer approval read returned ${response.status}`);
      }
      return parseApprovalState(await readBoundedJson(response));
    },
  });
}
