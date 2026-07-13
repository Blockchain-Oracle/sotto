import type { CantonPaymentRequirement } from "./payment-requirement.js";
import type { BoundedPurchaseCommitmentInput } from "./purchase-commitment.js";
import { readPaymentRequiredObservation } from "./payment-observation.js";
import {
  selectRequirement,
  validateBinding,
} from "./purchase-commitment-envelope.js";
import {
  atomic,
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
  REVISION_PATTERN,
  SHA256_PATTERN,
  sha256Hex,
} from "./purchase-commitment-primitives.js";

export const TOKEN_TRANSFER_FACTORY_INTERFACE_ID =
  "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory" as const;
export const RESOURCE_BINDING_VERSION = "sotto-resource-v1" as const;
export const FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules" as const;
export const MAX_PURCHASE_WINDOW_SECONDS = 600;

export type ValidatedPurchaseInput = Readonly<{
  challengeId: `sha256:${string}`;
  expiresAt: string;
  observedAt: string;
  requirement: CantonPaymentRequirement;
}>;

export function validateBoundedPurchaseInput(
  input: BoundedPurchaseCommitmentInput,
): ValidatedPurchaseInput {
  const root = objectValue(input, "purchase commitment input");
  exactKeys(
    root,
    [
      "authorizationInstanceId",
      "binding",
      "capability",
      "expectedNetwork",
      "paymentObservation",
      "payerParty",
      "tokenFactory",
    ],
    "purchase commitment input",
  );
  identifier(input.authorizationInstanceId, "authorizationInstanceId", 256);
  identifier(input.expectedNetwork, "expectedNetwork", 256);
  identifier(input.payerParty, "payerParty", 512);
  const observation = readPaymentRequiredObservation(input.paymentObservation);
  const observedAt = canonicalTime(observation.observedAt, "observedAt");
  const requestUrl = validateBinding(input);
  const requirement = selectRequirement(
    input,
    requestUrl,
    observation.challengeBytes,
  );
  if (
    requirement.maxTimeoutSeconds > MAX_PURCHASE_WINDOW_SECONDS ||
    requirement.extra.executeBeforeSeconds > MAX_PURCHASE_WINDOW_SECONDS
  ) {
    throw new Error("challenge purchase window exceeds 600 seconds");
  }
  const expiresAtMilliseconds =
    observedAt +
    Math.min(
      requirement.maxTimeoutSeconds,
      requirement.extra.executeBeforeSeconds,
    ) *
      1_000;
  if (!Number.isSafeInteger(expiresAtMilliseconds)) {
    throw new Error("challenge purchase window is not representable");
  }
  const expiresAt = new Date(expiresAtMilliseconds).toISOString();

  const capability = objectValue(input.capability, "capability");
  exactKeys(
    capability,
    [
      "contractId",
      "expiresAt",
      "maximumTotalDebitAtomic",
      "perCallLimitAtomic",
      "recipient",
      "remainingAllowanceAtomic",
      "resourceBindingVersion",
      "resourceHash",
      "revision",
    ],
    "capability",
  );
  identifier(input.capability.contractId, "capability contractId");
  identifier(input.capability.recipient, "capability recipient");
  if (
    !REVISION_PATTERN.test(input.capability.revision) ||
    BigInt(input.capability.revision) > 9_223_372_036_854_775_807n
  ) {
    throw new Error("capability revision must be a bounded integer");
  }
  const amount = atomic(requirement.amount, "challenge amount");
  const perCall = atomic(input.capability.perCallLimitAtomic, "per-call limit");
  const remaining = atomic(
    input.capability.remainingAllowanceAtomic,
    "remaining allowance",
  );
  const maximumDebit = atomic(
    input.capability.maximumTotalDebitAtomic,
    "maximum total debit",
  );
  if (amount === 0n) throw new Error("challenge amount must be positive");
  if (amount > perCall) throw new Error("amount exceeds per-call limit");
  if (amount > remaining) throw new Error("amount exceeds remaining allowance");
  if (amount > maximumDebit)
    throw new Error("amount exceeds maximum total debit");
  if (input.capability.recipient !== requirement.payTo) {
    throw new Error("capability recipient does not match challenge recipient");
  }
  if (input.capability.resourceBindingVersion !== RESOURCE_BINDING_VERSION) {
    throw new Error("capability resource binding version is unsupported");
  }
  const expectedResourceHash = `sha256:${sha256Hex(
    JSON.stringify({
      version: RESOURCE_BINDING_VERSION,
      origin: requestUrl.origin,
      pathname: requestUrl.pathname,
    }),
  )}`;
  if (
    !SHA256_PATTERN.test(input.capability.resourceHash) ||
    input.capability.resourceHash !== expectedResourceHash
  ) {
    throw new Error("capability resource hash does not match request route");
  }
  if (
    canonicalTime(input.capability.expiresAt, "capability expiresAt") <
    Date.parse(expiresAt)
  ) {
    throw new Error("capability expiresAt precedes challenge expiry");
  }

  const tokenFactory = objectValue(input.tokenFactory, "tokenFactory");
  exactKeys(
    tokenFactory,
    ["contractId", "expectedAdmin", "implementationTemplateId", "interfaceId"],
    "tokenFactory",
  );
  if (input.tokenFactory.interfaceId !== TOKEN_TRANSFER_FACTORY_INTERFACE_ID) {
    throw new Error("tokenFactory interface is not the pinned TransferFactory");
  }
  identifier(input.tokenFactory.contractId, "tokenFactory contractId");
  if (
    input.tokenFactory.implementationTemplateId !==
    FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID
  ) {
    throw new Error("tokenFactory implementation is not approved");
  }
  identifier(input.tokenFactory.expectedAdmin, "tokenFactory expected admin");
  if (
    input.tokenFactory.expectedAdmin !== requirement.extra.instrumentId.admin
  ) {
    throw new Error("tokenFactory expected admin does not match instrument");
  }
  return {
    challengeId: observation.challengeId,
    expiresAt,
    observedAt: observation.observedAt,
    requirement,
  };
}
