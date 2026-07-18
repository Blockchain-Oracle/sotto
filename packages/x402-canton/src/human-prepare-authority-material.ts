import { createHash } from "node:crypto";
import {
  canonicalPrepareTime,
  decodePrepareBase64,
  exactPrepareObject,
} from "./human-prepare-authority-primitives.js";
import type { HumanPrepareAuthorityPayload } from "./human-prepare-authority-types.js";
import {
  HUMAN_PURCHASE_COMMITMENT_VERSION,
  type HumanPurchaseCommitment,
} from "./human-purchase-commitment.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  selectRequirement,
  validateBinding,
} from "./purchase-commitment-envelope.js";
import {
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
} from "./purchase-commitment-primitives.js";
import { REQUEST_BINDING_VERSION } from "./request-binding.js";

function sha256(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function restoredHumanPurchaseCommitment(
  payload: HumanPrepareAuthorityPayload,
): HumanPurchaseCommitment {
  const source = payload.purchase;
  const canonicalBytes = decodePrepareBase64(
    source.canonicalBytes,
    32_768,
    "purchase canonical",
  );
  if (
    source.version !== HUMAN_PURCHASE_COMMITMENT_VERSION ||
    !SHA256_PATTERN.test(source.attemptId) ||
    !SHA256_PATTERN.test(source.challengeId) ||
    !SHA256_PATTERN.test(source.commitment) ||
    !SHA256_PATTERN.test(source.requestCommitment) ||
    source.commitment !== sha256(canonicalBytes)
  ) {
    throw new Error("restored human purchase identity is invalid");
  }
  const commitment = Object.freeze({
    version: HUMAN_PURCHASE_COMMITMENT_VERSION,
    attemptId: source.attemptId,
    canonicalBytes,
    challengeId: source.challengeId,
    commitment: source.commitment,
    expiresAt: canonicalPrepareTime(
      source.expiresAt,
      "restored human purchase expiry",
    ),
    requestCommitment: source.requestCommitment,
  });
  return commitment;
}

function requestBinding(payload: HumanPrepareAuthorityPayload) {
  const bytes = decodePrepareBase64(
    payload.requestBindingCanonicalBytes,
    65_536,
    "request binding canonical",
  );
  let root: Record<string, unknown>;
  try {
    root = exactPrepareObject(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      ["version", "method", "url", "headers", "bodySha256"],
      "restored request binding",
    );
  } catch {
    throw new Error("restored request binding is invalid");
  }
  if (
    root.version !== REQUEST_BINDING_VERSION ||
    typeof root.bodySha256 !== "string" ||
    !RAW_SHA256_PATTERN.test(root.bodySha256)
  ) {
    throw new Error("restored request binding is invalid");
  }
  return Object.freeze({
    version: REQUEST_BINDING_VERSION,
    bodySha256: root.bodySha256,
    canonicalBytes: bytes,
    commitment: sha256(bytes),
  });
}

export function validateRestoredHumanPurchaseMaterial(
  payload: HumanPrepareAuthorityPayload,
  intent: HumanPurchaseLedgerIntent,
): void {
  const binding = requestBinding(payload);
  const request = validateBinding({
    binding,
    expectedNetwork: intent.challenge.network,
    payerParty: intent.challenge.payerParty,
  });
  const challengeBytes = decodePrepareBase64(
    payload.paymentChallengeBytes,
    16_384,
    "payment challenge",
  );
  const requirement = selectRequirement(
    {
      binding,
      expectedNetwork: intent.challenge.network,
      payerParty: intent.challenge.payerParty,
    },
    request.url,
    challengeBytes,
  );
  const display = payload.requestDisplay;
  const expiry =
    Date.parse(intent.challenge.requestedAt) +
    Math.min(
      requirement.maxTimeoutSeconds,
      requirement.extra.executeBeforeSeconds,
    ) *
      1_000;
  if (
    binding.commitment !== intent.request.requestCommitment ||
    `sha256:${binding.bodySha256}` !== intent.request.bodyHash ||
    sha256(challengeBytes) !== intent.challenge.challengeId ||
    request.method !== display.method ||
    request.url.origin !== display.resourceOrigin ||
    request.url.pathname !== display.resourcePath ||
    (request.url.search !== "") !== display.queryPresent ||
    requirement.amount !== intent.challenge.amountAtomic ||
    requirement.asset !== intent.challenge.asset ||
    requirement.payTo !== intent.challenge.recipientParty ||
    requirement.extra.instrumentId.admin !==
      intent.challenge.instrument.admin ||
    requirement.extra.instrumentId.id !== intent.challenge.instrument.id ||
    requirement.extra.synchronizerId !== intent.challenge.synchronizerId ||
    new Date(expiry).toISOString() !== intent.challenge.executeBefore
  ) {
    throw new Error("restored human prepare material does not match");
  }
}
