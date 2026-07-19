import { HUMAN_PAYER_IDENTITY_VERSION } from "./human-payer-identity.js";
import { parseHumanPayerIdentity } from "./human-payer-identity-validation.js";
import { HUMAN_PURCHASE_ATTEMPT_VERSION } from "./human-purchase-commitment.js";
import type { ParsedHumanPurchaseCanonical } from "./human-purchase-ledger-intent-parser.js";
import type { HumanPayerSigningIdentity } from "./human-purchase-ledger-intent-types.js";
import {
  canonicalTime,
  identifier,
  SHA256_PATTERN,
  sha256Hex,
} from "./purchase-commitment-primitives.js";

export function humanLedgerSha256(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

export function projectHumanPayerSigningIdentity(
  value: Record<string, unknown>,
): HumanPayerSigningIdentity {
  if (value.version !== HUMAN_PAYER_IDENTITY_VERSION) {
    throw new Error("human payer identity version is unsupported");
  }
  const acquiredAt = identifier(value.acquiredAt, "human payer acquiredAt");
  canonicalTime(acquiredAt, "human payer acquiredAt");
  return parseHumanPayerIdentity(
    {
      keyPurpose: value.keyPurpose,
      network: value.network,
      party: value.party,
      publicKeyFormat: value.publicKeyFormat,
      publicKeyFingerprint: value.publicKeyFingerprint,
      signatureFormat: value.signatureFormat,
      signingAlgorithm: value.signingAlgorithm,
      synchronizerId: value.synchronizerId,
      topologyHash: value.topologyHash,
    },
    humanLedgerSha256(value.subjectHash, "human payer subjectHash"),
    acquiredAt,
  );
}

export function deriveHumanPurchaseAttemptId(
  parsed: ParsedHumanPurchaseCanonical,
): `sha256:${string}` {
  const { root } = parsed;
  const purchase = {
    version: root.version,
    authorizationMode: root.authorizationMode,
    request: parsed.request,
    challenge: parsed.challenge,
    payerIdentity: parsed.payerIdentity,
    limits: parsed.limits,
    tokenFactory: parsed.tokenFactory,
    packageSelection: parsed.packageSelection,
    authorizationInstanceId: root.authorizationInstanceId,
  };
  return `sha256:${sha256Hex(
    JSON.stringify({ version: HUMAN_PURCHASE_ATTEMPT_VERSION, purchase }),
  )}`;
}
