import {
  HUMAN_PURCHASE_APPROVAL_VERSION,
  HUMAN_WALLET_CAPABILITIES_VERSION,
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
  type HumanWalletApprovalRequest,
  type HumanWalletCapabilities,
  type HumanWalletConnector,
} from "@sotto/x402-canton";
import { MIN_HUMAN_SIGNING_RESERVE_MS } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { HumanPrepareAuthorityRestoreScope } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { SignerClient } from "./signer-client.js";
import { abortableDelay } from "./supervisor.js";

const POLL_INTERVAL_MS = 2_000;

export type SignerWalletConnectorInput = Readonly<{
  signer: SignerClient;
  scope: HumanPrepareAuthorityRestoreScope;
  now?: () => number;
}>;

/**
 * Canonical single-wallet capabilities for the signer-service connector,
 * reconstructed from the durable prepare-authority scope. Field order
 * mirrors the reference Five North wallet capabilities so a restored
 * preflight matches the persisted connector byte for byte.
 */
export function signerWalletCapabilities(
  scope: HumanPrepareAuthorityRestoreScope,
): HumanWalletCapabilities {
  const identity = scope.payerIdentity;
  return Object.freeze({
    version: HUMAN_WALLET_CAPABILITIES_VERSION,
    approvalVersions: Object.freeze([HUMAN_PURCHASE_APPROVAL_VERSION]),
    connectorId: scope.connector.connectorId,
    connectorKind: scope.connector.connectorKind,
    explicitApproval: true as const,
    hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2"]),
    networks: Object.freeze([identity.network]),
    origin: scope.connector.origin,
    packageIds: Object.freeze([scope.connector.expectedPackageId]),
    payerParty: identity.party,
    preparedTransactionSigning: true as const,
    signingKey: Object.freeze({
      fingerprint: identity.publicKeyFingerprint,
      publicKeyFormat: identity.publicKeyFormat,
      purpose: "SIGNING" as const,
      signatureFormat: identity.signatureFormat,
      signingAlgorithm: identity.signingAlgorithm,
    }),
    synchronizerIds: Object.freeze([identity.synchronizerId]),
  });
}

function requireApprovalRequest(
  candidate: HumanWalletApprovalRequest,
): HumanWalletApprovalRequest {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !(candidate.preparedTransaction instanceof Uint8Array) ||
    typeof candidate.approval !== "object" ||
    candidate.approval === null
  ) {
    throw new Error("signer wallet approval request is invalid");
  }
  return candidate;
}

function signingDeadline(
  request: HumanWalletApprovalRequest,
  now: number,
): number {
  const executeBefore = Date.parse(request.approval.executeBefore);
  const sessionExpiry = Date.parse(request.expiresAt);
  if (!Number.isFinite(executeBefore) || !Number.isFinite(sessionExpiry)) {
    throw new Error("signer wallet approval deadline is invalid");
  }
  const deadline = Math.min(
    executeBefore - MIN_HUMAN_SIGNING_RESERVE_MS,
    sessionExpiry,
  );
  if (deadline <= now) {
    throw new Error("signer wallet approval lacks the signing reserve");
  }
  return deadline;
}

/**
 * Human wallet connector backed by the signer service. The worker never
 * holds human key material: it creates one approval handoff, polls for the
 * human decision until the execute-before reserve is exhausted, and
 * collects the signature exactly once. Rejections become the canonical
 * user-rejected signing response.
 */
export function createSignerHumanWalletConnector(
  input: SignerWalletConnectorInput,
): HumanWalletConnector {
  const capabilities = signerWalletCapabilities(input.scope);
  const now = input.now ?? Date.now;
  return Object.freeze({
    discover: async ({ signal }) => {
      if (signal.aborted) throw new Error("signer wallet discovery cancelled");
      return capabilities;
    },
    requestApproval: async (candidate, { signal }) => {
      const request = requireApprovalRequest(
        candidate as HumanWalletApprovalRequest,
      );
      const deadline = signingDeadline(request, now());
      const created = await input.signer.createApproval(
        Object.freeze({
          operationId: request.approval.attemptId,
          walletId: request.approval.payerParty,
          approvalSummary: request.approval,
          preparedTransactionBase64: Buffer.from(
            request.preparedTransaction,
          ).toString("base64"),
          preparedTransactionHash: request.preparedTransactionHash,
          requestCommitment: request.approval.requestCommitment,
          expiresAt: new Date(deadline).toISOString(),
        }),
        Object.freeze({ signal }),
      );
      for (;;) {
        if (signal.aborted) throw new Error("signer wallet approval cancelled");
        if (now() >= deadline) {
          throw new Error("signer wallet approval reserve is exhausted");
        }
        const state = await input.signer.readApproval(created.approvalId, {
          signal,
        });
        if (state.state === "rejected") {
          return Object.freeze({
            version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
            outcome: "rejected" as const,
            reason: "user-rejected" as const,
            sessionId: request.sessionId,
          });
        }
        if (state.state === "expired") {
          throw new Error("signer wallet approval expired");
        }
        if (state.state === "approved") {
          const signature = state.signature;
          if (signature === undefined) {
            throw new Error("signer wallet signature was already collected");
          }
          if (
            signature.signedBy !== request.approval.signer.publicKeyFingerprint
          ) {
            throw new Error("signer wallet signature signer does not match");
          }
          return Object.freeze({
            version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
            outcome: "approved" as const,
            preparedTransactionHash: request.preparedTransactionHash,
            sessionId: request.sessionId,
            signature: Object.freeze({
              party: request.approval.payerParty,
              signature: signature.signatureBase64,
              signatureFormat: signature.format,
              signedBy: signature.signedBy,
              signingAlgorithm: request.approval.signer.signingAlgorithm,
            }),
          });
        }
        await abortableDelay(
          Math.min(POLL_INTERVAL_MS, deadline - now()),
          signal,
        );
      }
    },
  });
}
