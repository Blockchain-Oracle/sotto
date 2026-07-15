import { randomBytes } from "node:crypto";
import { assertBoundedCapabilityBootstrapFresh } from "./bounded-capability-bootstrap.js";
import {
  boundedCapabilityBootstrapState,
  MAX_BOOTSTRAP_AUTHORITY_AGE_MS,
} from "./bounded-capability-bootstrap-state.js";
import {
  CAPABILITY_WALLET_REQUEST_VERSION,
  MAX_CAPABILITY_WALLET_SESSION_MS,
  type ApprovedCapabilityWalletSigningSession,
  type CapabilityWalletApprovalRequest,
  type CapabilityWalletSigningResult,
  type CapabilityWalletSigningSessionInput,
} from "./capability-wallet-connector-types.js";
import { parseCapabilityWalletCapabilities } from "./capability-wallet-connector-validation.js";
import { withCapabilityWalletDeadline } from "./capability-wallet-deadline.js";
import { parseCapabilityWalletApprovalResponse } from "./capability-wallet-response-validation.js";
import { requireNegotiatedCapabilityWalletSignatureScheme } from "./capability-wallet-signature-scheme.js";
import { registerApprovedCapabilityWalletSigningSession } from "./capability-wallet-signing-session-state.js";
import { projectPreparedCapabilityBootstrapApproval } from "./prepared-capability-bootstrap-approval.js";
import {
  claimHashVerifiedPreparedCapabilityBootstrap,
  readHashVerifiedPreparedCapabilityBootstrap,
} from "./prepared-capability-bootstrap-hash.js";
import { SHA256_PATTERN } from "./purchase-commitment-primitives.js";

function sessionIdentifier(): `sha256:${string}` {
  return `sha256:${randomBytes(32).toString("hex")}`;
}

function capabilityIntentHash(commandId: string): `sha256:${string}` {
  const prefix = "sotto-capability-bootstrap-v1-";
  const candidate = `sha256:${commandId.slice(prefix.length)}`;
  if (!commandId.startsWith(prefix) || !SHA256_PATTERN.test(candidate)) {
    throw new Error("capability wallet intent hash is invalid");
  }
  return candidate as `sha256:${string}`;
}

function sessionTimeout(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_CAPABILITY_WALLET_SESSION_MS
  ) {
    throw new Error("capability wallet timeout is invalid");
  }
  return value as number;
}

function requireActiveSession(signal: AbortSignal, expiresAt: number): void {
  if (signal.aborted || Date.now() >= expiresAt) {
    throw new Error("capability wallet signing session is no longer active");
  }
}

export async function createCapabilityWalletSigningSession(
  input: CapabilityWalletSigningSessionInput,
): Promise<CapabilityWalletSigningResult> {
  const prepared = input.prepared;
  const connector = input.connector;
  const discover = connector.discover.bind(connector);
  const requestApproval = connector.requestApproval.bind(connector);
  const connectorId = input.connectorId;
  const connectorOrigin = input.connectorOrigin;
  const outerSignal = input.signal;
  const timeoutMilliseconds = sessionTimeout(input.timeoutMilliseconds);
  const startedAt = Date.now();
  const preparedState = readHashVerifiedPreparedCapabilityBootstrap(prepared);
  const bootstrapState = boundedCapabilityBootstrapState(preparedState.request);
  const approval = projectPreparedCapabilityBootstrapApproval(prepared);
  const intentHash = capabilityIntentHash(preparedState.request.commandId);
  const authorityExpiresAt =
    Date.parse(bootstrapState.validatedAt) + MAX_BOOTSTRAP_AUTHORITY_AGE_MS;
  const expiresAtMilliseconds = Math.min(
    startedAt + timeoutMilliseconds,
    authorityExpiresAt,
  );
  const effectiveTimeoutMilliseconds = expiresAtMilliseconds - startedAt;
  if (effectiveTimeoutMilliseconds < 1) {
    throw new Error("capability wallet signing authority has expired");
  }
  return withCapabilityWalletDeadline(
    async (signal) => {
      const identity = {
        connectorId,
        origin: connectorOrigin,
        packageId: approval.packageId,
        network: approval.network,
        payerParty: approval.payerParty,
      };
      const discovery = await discover(Object.freeze({ signal }));
      requireActiveSession(signal, expiresAtMilliseconds);
      const compatibility = parseCapabilityWalletCapabilities(
        discovery,
        identity,
      );
      if ("unsupported" in compatibility) return compatibility.unsupported;
      readHashVerifiedPreparedCapabilityBootstrap(prepared);
      const claimed = claimHashVerifiedPreparedCapabilityBootstrap(prepared);
      const sessionId = sessionIdentifier();
      const createdAt = new Date(startedAt).toISOString();
      const expiresAt = new Date(expiresAtMilliseconds).toISOString();
      const request: CapabilityWalletApprovalRequest = Object.freeze({
        approval,
        capabilityIntentHash: intentHash,
        connectorId: compatibility.capabilities.connectorId,
        connectorOrigin: compatibility.capabilities.origin,
        createdAt,
        expiresAt,
        preparedTransaction: new Uint8Array(claimed.preparedTransaction),
        preparedTransactionHash: approval.preparedTransactionHash,
        sessionId,
        version: CAPABILITY_WALLET_REQUEST_VERSION,
      });
      const responseValue = await requestApproval(
        request,
        Object.freeze({ signal }),
      );
      requireActiveSession(signal, expiresAtMilliseconds);
      assertBoundedCapabilityBootstrapFresh(preparedState.request);
      const response = parseCapabilityWalletApprovalResponse(responseValue);
      const resultIdentity = {
        connectorId: compatibility.capabilities.connectorId,
        connectorKind: compatibility.capabilities.connectorKind,
        origin: compatibility.capabilities.origin,
      } as const;
      if (response.outcome === "rejected") {
        return Object.freeze({
          ...resultIdentity,
          outcome: "rejected" as const,
          reason: response.reason,
          sessionId,
        });
      }
      requireNegotiatedCapabilityWalletSignatureScheme(
        compatibility.capabilities,
        response.signature,
      );
      const result = Object.freeze({
        ...resultIdentity,
        outcome: "approved" as const,
        sessionId,
        signature: response.signature,
      }) as ApprovedCapabilityWalletSigningSession;
      registerApprovedCapabilityWalletSigningSession(result, {
        capabilityIntentHash: intentHash,
        claimed: false,
        connectorId: resultIdentity.connectorId,
        connectorKind: resultIdentity.connectorKind,
        createdAt: startedAt,
        expiresAt: expiresAtMilliseconds,
        network: approval.network,
        origin: resultIdentity.origin,
        packageId: approval.packageId,
        payerParty: approval.payerParty,
        preparedTransaction: new Uint8Array(claimed.preparedTransaction),
        preparedTransactionHash: approval.preparedTransactionHash,
        sessionId,
        signature: response.signature,
        synchronizerId: approval.synchronizerId,
      });
      return result;
    },
    effectiveTimeoutMilliseconds,
    outerSignal,
  );
}

export {
  claimApprovedCapabilityWalletSigningSession,
  readApprovedCapabilityWalletSigningSession,
} from "./capability-wallet-signing-session-state.js";
