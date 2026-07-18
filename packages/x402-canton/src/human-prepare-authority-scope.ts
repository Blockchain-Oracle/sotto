import { validateHumanPurchaseConfiguration } from "./human-purchase-configuration.js";
import { parseHumanPurchaseCanonical } from "./human-purchase-ledger-intent-parser.js";
import {
  deriveHumanPurchaseAttemptId,
  humanLedgerSha256,
} from "./human-purchase-ledger-validation-primitives.js";
import { restoredHumanPurchaseCommitment } from "./human-prepare-authority-material.js";
import { exactPrepareObject } from "./human-prepare-authority-primitives.js";
import { readHumanPrepareAuthorityPlaintextState } from "./human-prepare-authority-state.js";
import {
  HUMAN_PREPARE_AUTHORITY_VERSION,
  type AuthenticatedHumanPrepareAuthorityPlaintext,
  type HumanPrepareAuthorityRestoreScope,
} from "./human-prepare-authority-types.js";
import {
  canonicalTime,
  identifier,
  RAW_SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";

function canonicalJson(value: unknown): string {
  const visit = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(visit);
    if (typeof candidate !== "object" || candidate === null) return candidate;
    return Object.fromEntries(
      Object.entries(candidate)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, visit(entry)]),
    );
  };
  return JSON.stringify(visit(value));
}

function requestDisplay(value: unknown) {
  const record = exactPrepareObject(
    value,
    ["method", "queryPresent", "resourceOrigin", "resourcePath"],
    "human prepare request display",
  );
  if (
    typeof record.method !== "string" ||
    typeof record.queryPresent !== "boolean" ||
    typeof record.resourceOrigin !== "string" ||
    typeof record.resourcePath !== "string"
  ) {
    throw new Error("human prepare request display is invalid");
  }
  return Object.freeze({
    method: record.method,
    queryPresent: record.queryPresent,
    resourceOrigin: record.resourceOrigin,
    resourcePath: record.resourcePath,
  });
}

export function readHumanPrepareAuthorityRestoreScope(
  candidate: AuthenticatedHumanPrepareAuthorityPlaintext,
): HumanPrepareAuthorityRestoreScope {
  const payload = readHumanPrepareAuthorityPlaintextState(candidate).payload;
  const commitment = restoredHumanPurchaseCommitment(payload);
  const parsed = parseHumanPurchaseCanonical(commitment);
  const { challenge, payerIdentity, packageSelection, request, tokenFactory } =
    parsed;
  const config = validateHumanPurchaseConfiguration(
    payload.trustedConfiguration,
  );
  if (
    parsed.root.attemptId !== commitment.attemptId ||
    deriveHumanPurchaseAttemptId(parsed) !== commitment.attemptId ||
    challenge.challengeId !== commitment.challengeId ||
    challenge.expiresAt !== commitment.expiresAt ||
    request.requestCommitment !== commitment.requestCommitment ||
    canonicalJson(payerIdentity) !== canonicalJson(payload.payerIdentity) ||
    canonicalJson(packageSelection) !==
      canonicalJson(payload.packageSelection) ||
    tokenFactory.contractId !== config.contractId ||
    tokenFactory.expectedAdmin !== config.expectedAdmin ||
    challenge.asset !== config.expectedAsset ||
    (challenge.instrument as Record<string, unknown>).id !==
      config.expectedInstrumentId
  ) {
    throw new Error("human prepare restore scope is inconsistent");
  }
  const capabilities = payload.connector.capabilities;
  if (
    !RAW_SHA256_PATTERN.test(payload.connector.expectedPackageId) ||
    !capabilities.packageIds.includes(payload.connector.expectedPackageId)
  ) {
    throw new Error("human prepare connector locator is invalid");
  }
  const observedAt = identifier(challenge.observedAt, "challenge observedAt");
  const executeBefore = identifier(challenge.expiresAt, "challenge expiry");
  canonicalTime(observedAt, "challenge observedAt");
  canonicalTime(executeBefore, "challenge expiry");
  return Object.freeze({
    version: HUMAN_PREPARE_AUTHORITY_VERSION,
    attemptId: commitment.attemptId,
    purchaseCommitment: commitment.commitment,
    challenge: Object.freeze({
      adminParty: identifier(
        (challenge.instrument as Record<string, unknown>).admin,
        "challenge admin",
      ),
      challengeId: humanLedgerSha256(challenge.challengeId, "challenge ID"),
      executeBefore,
      observedAt,
      payerParty: identifier(challenge.payer, "challenge payer"),
      providerParty: identifier(challenge.recipient, "challenge provider"),
      synchronizerId: identifier(
        challenge.synchronizerId,
        "challenge synchronizer",
      ),
    }),
    connector: Object.freeze({
      connectorId: capabilities.connectorId,
      connectorKind: capabilities.connectorKind,
      expectedPackageId: payload.connector.expectedPackageId,
      origin: capabilities.origin,
    }),
    packageSelection: payload.packageSelection,
    payerIdentity: payload.payerIdentity,
    requestDisplay: requestDisplay(payload.requestDisplay),
    trustedConfiguration: config,
  });
}
