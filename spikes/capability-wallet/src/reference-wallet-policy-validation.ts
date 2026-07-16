import type {
  ReferenceWalletIdentityPolicy,
  ReferenceWalletPolicy,
  ReferenceWalletPolicyAuthorization,
} from "./reference-wallet-types.js";

export const IDENTITY_POLICY_FIELDS = [
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
const AUTHORIZATION_POLICY_FIELDS = [
  "approvalMode",
  "authorizationId",
  "maximumApprovals",
  "maximumCapabilityLifetimeSeconds",
  "maximumTotalDebitAtomic",
  "perCallLimitAtomic",
  "recipientParty",
  "remainingAllowanceAtomic",
  "resourceHash",
  "revision",
  "validUntil",
  "version",
] as const;
const PACKAGE_ID = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const ATOMIC = /^(?:0|[1-9][0-9]{0,20})$/u;
const REVISION = /^(?:0|[1-9][0-9]{0,18})$/u;

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value.isWellFormed() &&
    Buffer.byteLength(value, "utf8") <= 512 &&
    ![...value].some((character) => character.trim() === "")
  );
}

function exactKeys(value: Record<string, unknown>, expected: string[]): void {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify(expected.sort())
  ) {
    throw new Error("reference wallet policy fields are invalid");
  }
}

function identityPolicy(
  policy: Record<string, unknown>,
): ReferenceWalletIdentityPolicy {
  if (
    IDENTITY_POLICY_FIELDS.some((field) => !identifier(policy[field])) ||
    !PACKAGE_ID.test(String(policy.packageId)) ||
    !FINGERPRINT.test(String(policy.signingFingerprint)) ||
    !String(policy.network).startsWith("canton:")
  ) {
    throw new Error("reference wallet policy fields are invalid");
  }
  return policy as ReferenceWalletIdentityPolicy;
}

function policyAuthorization(
  policy: Record<string, unknown>,
): ReferenceWalletPolicyAuthorization {
  const validUntil = Date.parse(String(policy.validUntil));
  if (
    policy.approvalMode !== "policy" ||
    policy.version !== "sotto-reference-wallet-policy-v2" ||
    policy.maximumApprovals !== 1 ||
    !Number.isSafeInteger(policy.maximumCapabilityLifetimeSeconds) ||
    (policy.maximumCapabilityLifetimeSeconds as number) < 300 ||
    (policy.maximumCapabilityLifetimeSeconds as number) > 86_400 ||
    !HASH.test(String(policy.authorizationId)) ||
    !HASH.test(String(policy.resourceHash)) ||
    !ATOMIC.test(String(policy.maximumTotalDebitAtomic)) ||
    !ATOMIC.test(String(policy.perCallLimitAtomic)) ||
    !ATOMIC.test(String(policy.remainingAllowanceAtomic)) ||
    !REVISION.test(String(policy.revision)) ||
    !identifier(policy.recipientParty) ||
    !Number.isFinite(validUntil) ||
    new Date(validUntil).toISOString() !== policy.validUntil
  ) {
    throw new Error("reference wallet authorization policy is invalid");
  }
  return policy as unknown as ReferenceWalletPolicyAuthorization;
}

export function parseReferenceWalletPolicy(
  value: unknown,
): ReferenceWalletPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("reference wallet policy is invalid");
  }
  const policy = value as Record<string, unknown>;
  const authorization = "version" in policy;
  exactKeys(
    policy,
    authorization
      ? [...IDENTITY_POLICY_FIELDS, ...AUTHORIZATION_POLICY_FIELDS]
      : [...IDENTITY_POLICY_FIELDS],
  );
  const identity = identityPolicy(policy);
  if (!authorization) return Object.freeze({ ...identity });
  return Object.freeze({ ...identity, ...policyAuthorization(policy) });
}

export function isPolicyAuthorizedReferenceWallet(
  policy: ReferenceWalletPolicy,
): policy is ReferenceWalletIdentityPolicy &
  ReferenceWalletPolicyAuthorization {
  return "version" in policy;
}
