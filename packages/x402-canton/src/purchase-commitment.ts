import type { HttpRequestCommitment } from "./request-binding.js";
import type { PaymentRequiredObservation } from "./payment-observation.js";
import {
  BOUNDED_PURCHASE_CAPABILITY_TEMPLATE,
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  RESOURCE_BINDING_VERSION,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
  validateBoundedPurchaseInput,
} from "./purchase-commitment-validation.js";
import { sha256Hex } from "./purchase-commitment-primitives.js";

export const PURCHASE_COMMITMENT_VERSION = "sotto-purchase-v2" as const;
export {
  BOUNDED_PURCHASE_CAPABILITY_TEMPLATE,
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  RESOURCE_BINDING_VERSION,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
};

export type PurchaseCapabilitySnapshot = Readonly<{
  agentParty: string;
  contractId: string;
  templateId: string;
  expiresAt: string;
  maximumTotalDebitAtomic: string;
  perCallLimitAtomic: string;
  recipient: string;
  remainingAllowanceAtomic: string;
  resourceBindingVersion: typeof RESOURCE_BINDING_VERSION;
  resourceHash: `sha256:${string}`;
  revision: string;
}>;

export type BoundedPurchaseCommitmentInput = Readonly<{
  authorizationInstanceId: string;
  binding: HttpRequestCommitment;
  capability: PurchaseCapabilitySnapshot;
  expectedNetwork: `canton:${string}`;
  paymentObservation: PaymentRequiredObservation;
  payerParty: string;
  tokenFactory: Readonly<{
    contractId: string;
    expectedAdmin: string;
    implementationTemplateId: typeof FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID;
    interfaceId: typeof TOKEN_TRANSFER_FACTORY_INTERFACE_ID;
  }>;
}>;

export type BoundedPurchaseCommitment = Readonly<{
  attemptId: `sha256:${string}`;
  bodyHash: `sha256:${string}`;
  canonicalBytes: Uint8Array;
  challengeId: `sha256:${string}`;
  commitment: `sha256:${string}`;
  expiresAt: string;
  requestCommitment: `sha256:${string}`;
  version: typeof PURCHASE_COMMITMENT_VERSION;
}>;

type AuthenticPurchaseState = Readonly<{
  attemptId: string;
  bodyHash: string;
  challengeId: string;
  commitment: string;
  expiresAt: string;
  requestCommitment: string;
  version: string;
}>;

const authenticPurchaseResults = new WeakMap<object, AuthenticPurchaseState>();

export function assertAuthenticBoundedPurchase(
  input: unknown,
): asserts input is BoundedPurchaseCommitment {
  if (typeof input !== "object" || input === null) {
    throw new Error("bounded purchase commitment is not authenticated");
  }
  const state = authenticPurchaseResults.get(input);
  if (state === undefined) {
    throw new Error("bounded purchase commitment is not authenticated");
  }
  const value = input as BoundedPurchaseCommitment;
  let canonicalCommitment: string;
  try {
    canonicalCommitment = `sha256:${sha256Hex(value.canonicalBytes)}`;
  } catch {
    throw new Error("bounded purchase commitment was mutated");
  }
  if (
    canonicalCommitment !== state.commitment ||
    value.attemptId !== state.attemptId ||
    value.bodyHash !== state.bodyHash ||
    value.challengeId !== state.challengeId ||
    value.commitment !== state.commitment ||
    value.expiresAt !== state.expiresAt ||
    value.requestCommitment !== state.requestCommitment ||
    value.version !== state.version
  ) {
    throw new Error("bounded purchase commitment was mutated");
  }
}

function deriveAttemptId(purchase: unknown): `sha256:${string}` {
  return `sha256:${sha256Hex(
    JSON.stringify({
      version: "sotto-payment-attempt-v2",
      purchase,
    }),
  )}`;
}

export function commitBoundedPurchase(
  input: BoundedPurchaseCommitmentInput,
): BoundedPurchaseCommitment {
  const { challengeId, expiresAt, observedAt, requirement } =
    validateBoundedPurchaseInput(input);
  const purchase = {
    version: PURCHASE_COMMITMENT_VERSION,
    authorizationMode: "bounded-capability",
    request: {
      bindingVersion: input.binding.version,
      requestCommitment: input.binding.commitment,
      bodyHash: `sha256:${input.binding.bodySha256}`,
    },
    challenge: {
      x402Version: 2,
      challengeId,
      observedAt,
      expiresAt,
      network: requirement.network,
      scheme: requirement.scheme,
      transferMethod: requirement.extra.assetTransferMethod,
      payer: input.payerParty,
      recipient: requirement.payTo,
      amountAtomic: requirement.amount,
      asset: requirement.asset,
      feePayer: requirement.extra.feePayer,
      instrument: {
        admin: requirement.extra.instrumentId.admin,
        id: requirement.extra.instrumentId.id,
      },
      synchronizerId: requirement.extra.synchronizerId,
    },
    capability: {
      agentParty: input.capability.agentParty,
      contractId: input.capability.contractId,
      templateId: input.capability.templateId,
      revision: input.capability.revision,
      resourceBindingVersion: input.capability.resourceBindingVersion,
      resourceHash: input.capability.resourceHash,
      recipient: input.capability.recipient,
      perCallLimitAtomic: input.capability.perCallLimitAtomic,
      remainingAllowanceAtomic: input.capability.remainingAllowanceAtomic,
      maximumTotalDebitAtomic: input.capability.maximumTotalDebitAtomic,
      expiresAt: input.capability.expiresAt,
    },
    tokenFactory: {
      interfaceId: input.tokenFactory.interfaceId,
      contractId: input.tokenFactory.contractId,
      implementationTemplateId: input.tokenFactory.implementationTemplateId,
      expectedAdmin: input.tokenFactory.expectedAdmin,
    },
    authorizationInstanceId: input.authorizationInstanceId,
  } as const;
  const attemptId = deriveAttemptId(purchase);
  const canonical = JSON.stringify({ ...purchase, attemptId });
  const canonicalBytes = new TextEncoder().encode(canonical);
  const result: BoundedPurchaseCommitment = Object.freeze({
    attemptId,
    bodyHash: `sha256:${input.binding.bodySha256}`,
    canonicalBytes,
    challengeId,
    commitment: `sha256:${sha256Hex(canonicalBytes)}`,
    expiresAt,
    requestCommitment: input.binding.commitment,
    version: PURCHASE_COMMITMENT_VERSION,
  });
  authenticPurchaseResults.set(result, {
    attemptId: result.attemptId,
    bodyHash: result.bodyHash,
    challengeId: result.challengeId,
    commitment: result.commitment,
    expiresAt: result.expiresAt,
    requestCommitment: result.requestCommitment,
    version: result.version,
  });
  return result;
}
