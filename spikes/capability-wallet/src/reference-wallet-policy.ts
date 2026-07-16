import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { decodeCanonicalWalletHandoffJson } from "./wallet-handoff-json.js";
import type {
  ReferenceWalletPolicy,
  SerializedReferenceWalletRequest,
} from "./reference-wallet-types.js";
import {
  isPolicyAuthorizedReferenceWallet,
  parseReferenceWalletPolicy,
} from "./reference-wallet-policy-validation.js";

export async function readReferenceWalletPolicy(
  path: string,
): Promise<ReferenceWalletPolicy> {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      (typeof process.getuid === "function" &&
        metadata.uid !== process.getuid()) ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size < 2 ||
      metadata.size > 16 * 1024
    ) {
      throw new Error("reference wallet policy file is not owner-only");
    }
    return parseReferenceWalletPolicy(
      decodeCanonicalWalletHandoffJson(await handle.readFile()),
    );
  } finally {
    await handle.close();
  }
}

export function requireReferenceWalletPolicy(
  request: SerializedReferenceWalletRequest,
  candidate: unknown,
): ReferenceWalletPolicy {
  const policy = parseReferenceWalletPolicy(candidate);
  const approval = request.approval;
  const expected = [
    [request.connectorId, policy.connectorId],
    [request.connectorOrigin, policy.connectorOrigin],
    [approval.network, policy.network],
    [approval.packageId, policy.packageId],
    [approval.payerParty, policy.payerParty],
    [approval.agentParty, policy.agentParty],
    [approval.synchronizerId, policy.synchronizerId],
    [approval.templateId, policy.templateId],
    [approval.instrument.admin, policy.instrumentAdmin],
    [approval.instrument.id, policy.instrumentId],
    [approval.transferFactoryContractId, policy.transferFactoryContractId],
  ];
  if (expected.some(([actual, trusted]) => actual !== trusted)) {
    throw new Error("reference wallet request does not match wallet policy");
  }
  if (isPolicyAuthorizedReferenceWallet(policy)) {
    const exact = [
      [approval.recipientParty, policy.recipientParty],
      [approval.resourceHash, policy.resourceHash],
      [approval.revision, policy.revision],
      [approval.limits.maximumTotalDebitAtomic, policy.maximumTotalDebitAtomic],
      [approval.limits.perCallLimitAtomic, policy.perCallLimitAtomic],
      [
        approval.limits.remainingAllowanceAtomic,
        policy.remainingAllowanceAtomic,
      ],
    ];
    const lifetime =
      Date.parse(approval.expiresAt) - Date.parse(request.createdAt);
    if (
      exact.some(([actual, trusted]) => actual !== trusted) ||
      Date.now() >= Date.parse(policy.validUntil) ||
      lifetime < 1 ||
      lifetime > policy.maximumCapabilityLifetimeSeconds * 1_000
    ) {
      throw new Error("reference wallet request exceeds wallet policy");
    }
  }
  return policy;
}

export function requireReferenceWalletSigningKey(
  actual: string,
  policy: ReferenceWalletPolicy,
): void {
  if (actual !== policy.signingFingerprint) {
    throw new Error(
      "reference wallet signing key does not match wallet policy",
    );
  }
}
