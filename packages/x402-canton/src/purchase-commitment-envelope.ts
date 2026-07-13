import {
  parsePaymentChallenge,
  type CantonPaymentRequirement,
} from "./payment-requirement.js";
import { REQUEST_BINDING_VERSION } from "./request-binding.js";
import type { BoundedPurchaseCommitmentInput } from "./purchase-commitment.js";
import {
  exactKeys,
  identifier,
  objectValue,
  RAW_SHA256_PATTERN,
  SHA256_PATTERN,
  sha256Hex,
} from "./purchase-commitment-primitives.js";
import { assertStrictJson } from "./strict-json.js";
import { validateRequestBindingCanonical } from "./request-binding-validation.js";

export function validateBinding(input: BoundedPurchaseCommitmentInput): URL {
  const binding = objectValue(input.binding, "request binding");
  exactKeys(
    binding,
    ["bodySha256", "canonicalBytes", "commitment", "version"],
    "request binding",
  );
  if (
    input.binding.version !== REQUEST_BINDING_VERSION ||
    !RAW_SHA256_PATTERN.test(input.binding.bodySha256) ||
    !SHA256_PATTERN.test(input.binding.commitment) ||
    !(input.binding.canonicalBytes instanceof Uint8Array) ||
    input.binding.canonicalBytes.byteLength > 65_536 ||
    input.binding.commitment !==
      `sha256:${sha256Hex(input.binding.canonicalBytes)}`
  ) {
    throw new Error("request binding commitment is invalid");
  }
  let canonicalText: string;
  try {
    canonicalText = new TextDecoder("utf-8", { fatal: true }).decode(
      input.binding.canonicalBytes,
    );
  } catch {
    throw new Error("request binding canonical bytes are invalid");
  }
  assertStrictJson(canonicalText);
  const canonical = JSON.parse(canonicalText) as unknown;
  return validateRequestBindingCanonical(
    canonical,
    canonicalText,
    input.binding,
  );
}

export function selectRequirement(
  input: BoundedPurchaseCommitmentInput,
  requestUrl: URL,
): CantonPaymentRequirement {
  if (
    !(input.challengeBytes instanceof Uint8Array) ||
    input.challengeBytes.byteLength < 1 ||
    input.challengeBytes.byteLength > 16_384
  ) {
    throw new Error("challenge bytes must contain 1-16384 bytes");
  }
  let challengeText: string;
  try {
    challengeText = new TextDecoder("utf-8", { fatal: true }).decode(
      input.challengeBytes,
    );
  } catch {
    throw new Error("challenge bytes must contain strict UTF-8 JSON");
  }
  assertStrictJson(challengeText);
  const decoded = JSON.parse(challengeText) as unknown;
  const challenge = objectValue(decoded, "Payment required challenge");
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) {
    throw new Error("Payment required challenge must use x402Version 2");
  }
  if (challenge.accepts.length > 32) {
    throw new Error("Payment required challenge allows at most 32 accepts");
  }
  const resource = objectValue(challenge.resource, "Payment required resource");
  if (
    typeof resource.url !== "string" ||
    new URL(resource.url).toString() !== requestUrl.toString()
  ) {
    throw new Error("challenge resource URL must match the request binding");
  }
  const matches = challenge.accepts.filter((candidate) => {
    const value = objectValue(candidate, "Payment requirement");
    return value.scheme === "exact" && value.network === input.expectedNetwork;
  });
  if (matches.length !== 1) {
    throw new Error("Expected exactly one matching Canton requirement");
  }
  const selected = objectValue(matches[0], "Payment requirement");
  exactKeys(
    selected,
    [
      "amount",
      "asset",
      "extra",
      "maxTimeoutSeconds",
      "network",
      "payTo",
      "scheme",
    ],
    "Payment requirement",
  );
  const extra = objectValue(selected.extra, "Payment requirement extra");
  exactKeys(
    extra,
    [
      "assetTransferMethod",
      "executeBeforeSeconds",
      "feePayer",
      "instrumentId",
      "memo",
      "synchronizerId",
    ],
    "Payment requirement extra including memo",
  );
  exactKeys(
    objectValue(extra.instrumentId, "instrumentId"),
    ["admin", "id"],
    "instrumentId",
  );
  const requirement = parsePaymentChallenge(matches[0]);
  identifier(requirement.network, "challenge network", 256);
  identifier(requirement.asset, "challenge asset", 512);
  identifier(requirement.payTo, "challenge recipient", 512);
  identifier(requirement.extra.feePayer, "challenge fee payer", 512);
  identifier(requirement.extra.instrumentId.admin, "instrument admin", 512);
  identifier(requirement.extra.instrumentId.id, "instrument id", 512);
  identifier(requirement.extra.synchronizerId, "challenge synchronizer", 512);
  if (requirement.extra.assetTransferMethod !== "transfer-factory") {
    throw new Error("Bounded purchase requires transfer-factory");
  }
  if (requirement.extra.memo !== input.binding.commitment) {
    throw new Error("challenge memo must carry the request commitment");
  }
  if (requirement.extra.feePayer !== input.payerParty) {
    throw new Error("challenge fee payer must match payerParty");
  }
  return requirement;
}
