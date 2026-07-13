import type { HttpRequestCommitment } from "./request-binding.js";
import {
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  RESOURCE_BINDING_VERSION,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
  validateBoundedPurchaseInput,
} from "./purchase-commitment-validation.js";
import { sha256Hex } from "./purchase-commitment-primitives.js";

export const PURCHASE_COMMITMENT_VERSION = "sotto-purchase-v2" as const;
export {
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  RESOURCE_BINDING_VERSION,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
};

export type PurchaseCapabilitySnapshot = Readonly<{
  contractId: string;
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
  challengeBytes: Uint8Array;
  expectedNetwork: `canton:${string}`;
  observedAt: string;
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
  canonicalBytes: Uint8Array;
  challengeId: `sha256:${string}`;
  commitment: `sha256:${string}`;
  expiresAt: string;
  version: typeof PURCHASE_COMMITMENT_VERSION;
}>;

function deriveAttemptId(
  requestCommitment: string,
  authorizationInstanceId: string,
): `sha256:${string}` {
  return `sha256:${sha256Hex(
    JSON.stringify({
      version: "sotto-payment-attempt-v1",
      requestCommitment,
      authorizationInstanceId,
    }),
  )}`;
}

export function commitBoundedPurchase(
  input: BoundedPurchaseCommitmentInput,
): BoundedPurchaseCommitment {
  const { expiresAt, requirement } = validateBoundedPurchaseInput(input);
  const challengeId = `sha256:${sha256Hex(input.challengeBytes)}` as const;
  const attemptId = deriveAttemptId(
    input.binding.commitment,
    input.authorizationInstanceId,
  );
  const canonical = JSON.stringify({
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
      observedAt: input.observedAt,
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
      contractId: input.capability.contractId,
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
    attemptId,
  });
  const canonicalBytes = new TextEncoder().encode(canonical);
  return {
    attemptId,
    canonicalBytes,
    challengeId,
    commitment: `sha256:${sha256Hex(canonicalBytes)}`,
    expiresAt,
    version: PURCHASE_COMMITMENT_VERSION,
  };
}
