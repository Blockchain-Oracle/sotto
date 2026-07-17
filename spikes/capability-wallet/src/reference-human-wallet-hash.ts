import { timingSafeEqual } from "node:crypto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import { recomputeReferenceWalletPreparedHash } from "./reference-wallet-public-identity.js";
import { verifyReferenceHumanWalletPreparedApproval } from "./reference-human-wallet-prepared.js";
import { parseReferenceHumanWalletRequest } from "./reference-human-wallet-request.js";

export const VERIFIED_REFERENCE_HUMAN_WALLET_REQUEST_VERSION =
  "sotto-reference-human-wallet-verified-v1" as const;

export type VerifiedReferenceHumanWalletRequest = Readonly<{
  version: typeof VERIFIED_REFERENCE_HUMAN_WALLET_REQUEST_VERSION;
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
  verifiedAt: string;
}>;

type VerifiedState = {
  claimed: boolean;
  request: HumanWalletApprovalRequest;
  verifiedAt: number;
};

const states = new WeakMap<object, VerifiedState>();

function requireActive(
  signal: AbortSignal | undefined,
  startedAt: number,
  expiresAt: string,
): number {
  if (signal?.aborted) {
    throw new Error("reference human wallet verification was cancelled");
  }
  const now = Date.now();
  if (now < startedAt || now >= Date.parse(expiresAt)) {
    throw new Error("reference human wallet request is not active");
  }
  return now;
}

function requestSnapshot(
  parsed: ReturnType<typeof parseReferenceHumanWalletRequest>,
): HumanWalletApprovalRequest {
  return Object.freeze({
    ...parsed,
    preparedTransaction: new Uint8Array(
      Buffer.from(parsed.preparedTransaction, "base64"),
    ),
  });
}

export async function verifyReferenceHumanWalletRequest(
  payload: unknown,
  options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<VerifiedReferenceHumanWalletRequest> {
  const startedAt = Date.now();
  const request = requestSnapshot(parseReferenceHumanWalletRequest(payload));
  requireActive(options.signal, startedAt, request.expiresAt);
  let computed: Uint8Array;
  try {
    computed = await recomputeReferenceWalletPreparedHash(
      new Uint8Array(request.preparedTransaction),
    );
  } catch {
    requireActive(options.signal, startedAt, request.expiresAt);
    throw new Error(
      "reference human wallet prepared hash recomputation failed",
    );
  }
  const verifiedAt = requireActive(
    options.signal,
    startedAt,
    request.expiresAt,
  );
  const expected = Buffer.from(request.preparedTransactionHash.slice(7), "hex");
  if (
    computed.byteLength !== 32 ||
    expected.byteLength !== 32 ||
    !timingSafeEqual(Buffer.from(computed), expected)
  ) {
    throw new Error(
      "reference human wallet prepared transaction hash mismatch",
    );
  }
  verifyReferenceHumanWalletPreparedApproval(request);
  requireActive(options.signal, startedAt, request.expiresAt);
  const verified = Object.freeze({
    version: VERIFIED_REFERENCE_HUMAN_WALLET_REQUEST_VERSION,
    preparedTransactionHash: request.preparedTransactionHash,
    sessionId: request.sessionId,
    verifiedAt: new Date(verifiedAt).toISOString(),
  }) as VerifiedReferenceHumanWalletRequest;
  states.set(verified, {
    claimed: false,
    request: Object.freeze({
      ...request,
      preparedTransaction: new Uint8Array(request.preparedTransaction),
    }),
    verifiedAt,
  });
  return verified;
}

export function claimVerifiedReferenceHumanWalletRequest(
  candidate: unknown,
  options: Readonly<{ signal?: AbortSignal }> = {},
): HumanWalletApprovalRequest {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error(
      "reference human wallet verified request is not authenticated",
    );
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error(
      "reference human wallet verified request is not authenticated",
    );
  }
  if (state.claimed) {
    throw new Error(
      "reference human wallet verified request is already claimed",
    );
  }
  requireActive(options.signal, state.verifiedAt, state.request.expiresAt);
  state.claimed = true;
  return Object.freeze({
    ...state.request,
    preparedTransaction: new Uint8Array(state.request.preparedTransaction),
  });
}
