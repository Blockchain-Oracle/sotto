import { createHash } from "node:crypto";
import {
  parsePaymentChallenge,
  type CantonPaymentRequirement,
} from "./payment-requirement.js";
import type { HttpRequestCommitment } from "./request-binding.js";

export const PURCHASE_COMMITMENT_VERSION = "sotto-purchase-v2" as const;
export const TOKEN_TRANSFER_FACTORY_INTERFACE_ID =
  "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory" as const;

export type PurchaseCapabilitySnapshot = Readonly<{
  contractId: string;
  expiresAt: string;
  maximumTotalDebitAtomic: string;
  perCallLimitAtomic: string;
  recipient: string;
  remainingAllowanceAtomic: string;
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
    expectedAdmin: string;
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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function selectRequirement(
  challengeBytes: Uint8Array,
  expectedNetwork: string,
): CantonPaymentRequirement {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(challengeBytes));
  const challenge = objectValue(decoded, "Payment required challenge");
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) {
    throw new Error("Payment required challenge must use x402Version 2");
  }
  const matches = challenge.accepts.filter((candidate) => {
    const value = objectValue(candidate, "Payment requirement");
    return value.scheme === "exact" && value.network === expectedNetwork;
  });
  if (matches.length !== 1) {
    throw new Error("Expected exactly one matching Canton requirement");
  }
  const requirement = parsePaymentChallenge(matches[0]);
  if (requirement.extra.assetTransferMethod !== "transfer-factory") {
    throw new Error("Bounded purchase requires transfer-factory");
  }
  return requirement;
}

function deriveAttemptId(
  requestCommitment: string,
  authorizationInstanceId: string,
): `sha256:${string}` {
  return `sha256:${sha256(
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
  const requirement = selectRequirement(
    input.challengeBytes,
    input.expectedNetwork,
  );
  const observedAt = new Date(input.observedAt);
  const lifetimeSeconds = Math.min(
    requirement.maxTimeoutSeconds,
    requirement.extra.executeBeforeSeconds,
  );
  const expiresAt = new Date(
    observedAt.getTime() + lifetimeSeconds * 1_000,
  ).toISOString();
  const challengeId = `sha256:${sha256(input.challengeBytes)}` as const;
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
      resourceHash: input.capability.resourceHash,
      recipient: input.capability.recipient,
      perCallLimitAtomic: input.capability.perCallLimitAtomic,
      remainingAllowanceAtomic: input.capability.remainingAllowanceAtomic,
      maximumTotalDebitAtomic: input.capability.maximumTotalDebitAtomic,
      expiresAt: input.capability.expiresAt,
    },
    tokenFactory: {
      interfaceId: input.tokenFactory.interfaceId,
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
    commitment: `sha256:${sha256(canonicalBytes)}`,
    expiresAt,
    version: PURCHASE_COMMITMENT_VERSION,
  };
}
