import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
} from "./human-observation-deadline.js";
import {
  prepareHashVerifiedHumanPreparedPurchaseClaim,
  readHashVerifiedHumanPreparedPurchase,
} from "./human-prepared-purchase-hash-state.js";
import { projectHumanPreparedPurchaseApproval } from "./human-purchase-approval.js";
import { prepareHumanWalletConnectorPreflightSessionClaim } from "./human-wallet-connector-preflight-state.js";
import { rediscoverHumanWalletCapabilities } from "./human-wallet-signing-capabilities.js";
import { validateHumanWalletSigningInput } from "./human-wallet-signing-input.js";
import { parseHumanWalletSigningResponse } from "./human-wallet-signing-response.js";
import { verifyHumanWalletPreparedSignature } from "./human-wallet-signing-signature.js";
import { registerVerifiedHumanWalletSigningSession } from "./human-wallet-signing-session-state.js";
import {
  humanWalletSigningSessionExpiry,
  humanWalletSigningSessionId,
  requestHumanWalletApproval,
  requireHumanWalletApprovalAuthority,
} from "./human-wallet-signing-session-operations.js";
import {
  HUMAN_WALLET_SIGNING_REQUEST_VERSION,
  HUMAN_WALLET_SIGNING_SESSION_VERSION,
  MAX_HUMAN_WALLET_SIGNING_SESSION_MS,
  type HumanWalletSigningDependencies,
  type HumanWalletSigningResult,
  type HumanWalletSigningSessionInput,
  type HumanWalletSigningSessionOptions,
  type VerifiedHumanWalletSigningSession,
} from "./human-wallet-signing-types.js";

export async function createHumanWalletSigningSession(
  candidateInput: HumanWalletSigningSessionInput,
  candidateDependencies: HumanWalletSigningDependencies,
  candidateOptions: HumanWalletSigningSessionOptions = {},
): Promise<HumanWalletSigningResult> {
  const validated = validateHumanWalletSigningInput(
    candidateInput,
    candidateDependencies,
    candidateOptions,
  );
  const { preflight, prepared } = validated.input;
  const preparedState = readHashVerifiedHumanPreparedPurchase(prepared);
  const approval = projectHumanPreparedPurchaseApproval(prepared);
  const purchaseCommitment = preparedState.intent.purchaseCommitment;
  const initialPreflight = prepareHumanWalletConnectorPreflightSessionClaim(
    preflight,
    purchaseCommitment,
  );
  requireHumanWalletApprovalAuthority(initialPreflight.authority, approval);
  const startedAt = Date.now();
  const expiresAt = humanWalletSigningSessionExpiry(
    approval.executeBefore,
    startedAt,
    validated.timeoutMilliseconds,
  );
  const effectiveTimeout = expiresAt - startedAt;
  return await withHumanObservationDeadline(
    "human wallet signing session",
    MAX_HUMAN_WALLET_SIGNING_SESSION_MS,
    {
      ...(validated.signal === undefined ? {} : { signal: validated.signal }),
      timeoutMilliseconds: effectiveTimeout,
    },
    async (signal) => {
      const discovered = await rediscoverHumanWalletCapabilities(
        initialPreflight.authority,
        signal,
      );
      requireHumanObservationActive(signal, "human wallet signing session");
      if ("unsupported" in discovered) return discovered.unsupported;
      const preflightClaim = prepareHumanWalletConnectorPreflightSessionClaim(
        preflight,
        purchaseCommitment,
      );
      const preparedClaim =
        prepareHashVerifiedHumanPreparedPurchaseClaim(prepared);
      const currentSessionId = humanWalletSigningSessionId();
      const request = Object.freeze({
        version: HUMAN_WALLET_SIGNING_REQUEST_VERSION,
        approval,
        connectorId: preflightClaim.authority.capabilities.connectorId,
        connectorKind: preflightClaim.authority.capabilities.connectorKind,
        connectorOrigin: preflightClaim.authority.capabilities.origin,
        createdAt: new Date(startedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
        preparedTransaction: new Uint8Array(
          preparedClaim.snapshot.preparedTransaction,
        ),
        preparedTransactionHash: approval.preparedTransactionHash,
        sessionId: currentSessionId,
      });
      preflightClaim.commit();
      preparedClaim.commit();
      if (validated.onApprovalRequested !== undefined) {
        try {
          await validated.onApprovalRequested(
            Object.freeze({
              connectorId: request.connectorId,
              connectorKind: request.connectorKind,
              sessionId: currentSessionId,
            }),
          );
        } catch {
          throw new Error("human wallet approval journal failed");
        }
        requireHumanObservationActive(signal, "human wallet signing session");
      }
      const response = parseHumanWalletSigningResponse(
        await requestHumanWalletApproval(
          preflightClaim.authority,
          request,
          signal,
        ),
        {
          preparedTransactionHash: request.preparedTransactionHash,
          sessionId: currentSessionId,
        },
      );
      requireHumanObservationActive(signal, "human wallet signing session");
      const identity = {
        version: HUMAN_WALLET_SIGNING_SESSION_VERSION,
        connectorId: request.connectorId,
        connectorKind: request.connectorKind,
        origin: request.connectorOrigin,
        sessionId: currentSessionId,
      } as const;
      if (response.outcome === "rejected") {
        return Object.freeze({
          ...identity,
          outcome: "rejected" as const,
          reason: response.reason,
        });
      }
      await verifyHumanWalletPreparedSignature(
        preflightClaim.authority,
        response.signature,
        request.preparedTransactionHash,
        validated.resolveRegisteredPublicKey,
        signal,
      );
      requireHumanObservationActive(signal, "human wallet signing session");
      const verifiedAt = Date.now();
      if (verifiedAt >= expiresAt) {
        throw new Error("human wallet signing session is no longer active");
      }
      const result = Object.freeze({
        ...identity,
        outcome: "verified" as const,
        preparedTransactionHash: request.preparedTransactionHash,
        verifiedAt: new Date(verifiedAt).toISOString(),
      }) as VerifiedHumanWalletSigningSession;
      registerVerifiedHumanWalletSigningSession(result, {
        connectorId: request.connectorId,
        connectorKind: request.connectorKind,
        createdAt: startedAt,
        expiresAt,
        network: approval.network,
        origin: request.connectorOrigin,
        packageId: approval.selectedPackage.packageId,
        party: approval.payerParty,
        preparedTransaction: preparedClaim.snapshot.preparedTransaction,
        preparedTransactionHash: request.preparedTransactionHash,
        purchaseCommitment: approval.purchaseCommitment,
        sessionId: currentSessionId,
        signature: response.signature,
        synchronizerId: approval.synchronizerId,
      });
      return result;
    },
  );
}
