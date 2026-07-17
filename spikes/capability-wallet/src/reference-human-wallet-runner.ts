import {
  SDK,
  getPublicKeyFromPrivate,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import {
  claimVerifiedReferenceHumanWalletRequest,
  verifyReferenceHumanWalletRequest,
} from "./reference-human-wallet-hash.js";
import type {
  ReferenceHumanWalletApprovalResponse,
  ReferenceHumanWalletRunInput,
} from "./reference-human-wallet-types.js";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";
import { createWalletHandoffStorage } from "./wallet-handoff-storage.js";

function walletSignal(signal: AbortSignal | undefined): AbortSignal {
  return signal ?? new AbortController().signal;
}

function requireActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("reference human wallet approval was cancelled");
  }
}

function requireRequestActive(
  signal: AbortSignal,
  startedAt: number,
  expiresAt: string,
): void {
  requireActive(signal);
  const now = Date.now();
  if (now < startedAt || now >= Date.parse(expiresAt)) {
    throw new Error("reference human wallet approval is no longer active");
  }
}

async function signApprovedRequest(
  input: Extract<ReferenceHumanWalletRunInput, { approved: true }>,
  request: ReturnType<typeof claimVerifiedReferenceHumanWalletRequest>,
  signal: AbortSignal,
  startedAt: number,
): Promise<ReferenceHumanWalletApprovalResponse> {
  const sdk = SDK.createOffline();
  return await withReferenceWalletPrivateKey(input.keyFile, async (key) => {
    requireRequestActive(signal, startedAt, request.expiresAt);
    const privateKey = key.toString("base64");
    const publicKey = getPublicKeyFromPrivate(privateKey);
    const signedBy = await sdk.keys.fingerprint(publicKey);
    requireRequestActive(signal, startedAt, request.expiresAt);
    if (signedBy !== request.approval.signer.publicKeyFingerprint) {
      throw new Error(
        "reference human wallet key does not match the registered payer",
      );
    }
    const digest = Buffer.from(
      request.preparedTransactionHash.slice("sha256:".length),
      "hex",
    ).toString("base64");
    return Object.freeze({
      version: "sotto-human-wallet-response-v1" as const,
      outcome: "approved" as const,
      preparedTransactionHash: request.preparedTransactionHash,
      sessionId: request.sessionId,
      signature: Object.freeze({
        party: request.approval.payerParty,
        signature: signTransactionHash(digest, privateKey),
        signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
        signedBy,
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
      }),
    });
  });
}

export async function runReferenceHumanWalletApproval(
  input: ReferenceHumanWalletRunInput,
): Promise<ReferenceHumanWalletApprovalResponse> {
  const startedAt = Date.now();
  const signal = walletSignal(input.signal);
  requireActive(signal);
  const storage = await createWalletHandoffStorage({
    rootDirectory: input.rootDirectory,
  });
  requireActive(signal);
  const artifact = await storage.claim(input.handoffId, "request");
  requireActive(signal);
  const verified = await verifyReferenceHumanWalletRequest(artifact.payload, {
    signal,
  });
  const request = claimVerifiedReferenceHumanWalletRequest(verified, {
    signal,
  });
  requireRequestActive(signal, startedAt, request.expiresAt);
  await input.presentSummary(JSON.stringify(request.approval, null, 2));
  requireRequestActive(signal, startedAt, request.expiresAt);
  const response: ReferenceHumanWalletApprovalResponse = input.approved
    ? await signApprovedRequest(input, request, signal, startedAt)
    : Object.freeze({
        version: "sotto-human-wallet-response-v1" as const,
        outcome: "rejected" as const,
        reason: "user-rejected" as const,
        sessionId: request.sessionId,
      });
  requireRequestActive(signal, startedAt, request.expiresAt);
  await storage.create({
    expiresAt: request.expiresAt,
    id: input.handoffId,
    kind: "response",
    payload: response,
  });
  requireRequestActive(signal, startedAt, request.expiresAt);
  return response;
}
