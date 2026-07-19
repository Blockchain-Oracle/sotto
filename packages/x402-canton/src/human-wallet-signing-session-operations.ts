import { randomBytes } from "node:crypto";
import type { HumanPreparedPurchaseApproval } from "./human-purchase-approval.js";
import type { HumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
import type { HumanWalletApprovalRequest } from "./human-wallet-signing-types.js";

export function humanWalletSigningSessionId(): `sha256:${string}` {
  return `sha256:${randomBytes(32).toString("hex")}`;
}

export function humanWalletSigningSessionExpiry(
  executeBefore: string,
  startedAt: number,
  timeoutMilliseconds: number,
): number {
  const deadline = Date.parse(executeBefore);
  const timeout = startedAt + timeoutMilliseconds;
  if (!Number.isSafeInteger(deadline) || !Number.isSafeInteger(timeout)) {
    throw new Error("human wallet signing deadline is invalid");
  }
  const expiresAt = Math.min(deadline, timeout);
  if (expiresAt <= startedAt) {
    throw new Error("human wallet signing authority has expired");
  }
  return expiresAt;
}

export function requireHumanWalletApprovalAuthority(
  authority: HumanWalletConnectorPreflightAuthority,
  approval: HumanPreparedPurchaseApproval,
): void {
  const identity = authority.identity;
  const signer = approval.signer;
  if (
    approval.payerParty !== identity.party ||
    approval.network !== identity.network ||
    approval.synchronizerId !== identity.synchronizerId ||
    approval.selectedPackage.packageId !== authority.expectedPackageId ||
    signer.publicKeyFingerprint !== identity.publicKeyFingerprint ||
    signer.publicKeyFormat !== identity.publicKeyFormat ||
    signer.signatureFormat !== identity.signatureFormat ||
    signer.signingAlgorithm !== identity.signingAlgorithm
  ) {
    throw new Error(
      "human wallet preflight does not match the prepared purchase",
    );
  }
}

export async function requestHumanWalletApproval(
  authority: HumanWalletConnectorPreflightAuthority,
  request: HumanWalletApprovalRequest,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    return await authority.connector.requestApproval(
      request,
      Object.freeze({ signal }),
    );
  } catch {
    throw new Error("human wallet approval failed");
  }
}
