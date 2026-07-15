import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { decodeCanonicalWalletHandoffJson } from "./wallet-handoff-json.js";
import type {
  ReferenceWalletPolicy,
  SerializedReferenceWalletRequest,
} from "./reference-wallet-types.js";

const POLICY_FIELDS = [
  "agentParty",
  "connectorId",
  "connectorOrigin",
  "instrumentAdmin",
  "instrumentId",
  "network",
  "packageId",
  "payerParty",
  "signingFingerprint",
  "synchronizerId",
  "templateId",
  "transferFactoryContractId",
] as const;
const PACKAGE_ID = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

function exactIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value.isWellFormed() &&
    Buffer.byteLength(value, "utf8") <= 512 &&
    ![...value].some((character) => character.trim() === "")
  );
}

function parsePolicy(value: unknown): ReferenceWalletPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("reference wallet policy is invalid");
  }
  const policy = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(policy).sort()) !==
      JSON.stringify([...POLICY_FIELDS].sort()) ||
    POLICY_FIELDS.some((field) => !exactIdentifier(policy[field])) ||
    !PACKAGE_ID.test(policy.packageId as string) ||
    !FINGERPRINT.test(policy.signingFingerprint as string) ||
    !(policy.network as string).startsWith("canton:")
  ) {
    throw new Error("reference wallet policy fields are invalid");
  }
  return Object.freeze({ ...policy }) as ReferenceWalletPolicy;
}

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
    return parsePolicy(
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
  const policy = parsePolicy(candidate);
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
