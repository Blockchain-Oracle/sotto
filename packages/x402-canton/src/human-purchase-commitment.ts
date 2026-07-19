import { randomBytes } from "node:crypto";
import { bindHumanPurchaseAuthorities } from "./human-purchase-authority.js";
import { validateHumanPurchaseConfiguration } from "./human-purchase-configuration.js";
import { validateHumanPurchaseInput } from "./human-purchase-commitment-validation.js";
import type {
  HumanPurchaseCommitment,
  HumanPurchaseCommitmentInput,
  HumanPurchaseCommitter,
  HumanPurchaseTrustedConfiguration,
} from "./human-purchase-commitment-types.js";
import {
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "./purchase-commitment-validation.js";
import { identifier, sha256Hex } from "./purchase-commitment-primitives.js";
import { encodeBoundedHumanPurchaseCanonical } from "./human-purchase-canonical.js";
import { registerAuthenticHumanPurchaseCommitment } from "./human-purchase-commitment-authenticity.js";

export const HUMAN_PURCHASE_COMMITMENT_VERSION =
  "sotto-human-purchase-v1" as const;
export const HUMAN_PURCHASE_ATTEMPT_VERSION =
  "sotto-human-purchase-attempt-v1" as const;

function hash(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${sha256Hex(value)}`;
}

function commitWithAuthorization(
  input: HumanPurchaseCommitmentInput,
  config: HumanPurchaseTrustedConfiguration,
  authorizationInstanceId: string,
): HumanPurchaseCommitment {
  const validated = validateHumanPurchaseInput(input, config);
  const identity = validated.identity;
  const requirement = validated.requirement;
  const purchase = {
    version: HUMAN_PURCHASE_COMMITMENT_VERSION,
    authorizationMode: "human-wallet",
    request: {
      bindingVersion: validated.binding.version,
      requestCommitment: validated.binding.commitment,
      bodyHash: `sha256:${validated.binding.bodySha256}`,
    },
    challenge: {
      x402Version: 2,
      challengeId: validated.challengeId,
      observedAt: validated.observedAt,
      expiresAt: validated.expiresAt,
      network: identity.network,
      scheme: requirement.scheme,
      transferMethod: requirement.extra.assetTransferMethod,
      payer: identity.party,
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
    payerIdentity: {
      version: identity.version,
      party: identity.party,
      network: identity.network,
      synchronizerId: identity.synchronizerId,
      publicKeyFingerprint: identity.publicKeyFingerprint,
      signingAlgorithm: identity.signingAlgorithm,
      signatureFormat: identity.signatureFormat,
      publicKeyFormat: identity.publicKeyFormat,
      keyPurpose: identity.keyPurpose,
      topologyHash: identity.topologyHash,
      acquiredAt: identity.acquiredAt,
      subjectHash: identity.subjectHash,
    },
    limits: {
      maximumFeeAtomic: validated.maximumFeeAtomic,
      maximumTotalDebitAtomic: validated.maximumTotalDebitAtomic,
    },
    tokenFactory: {
      interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
      contractId: validated.tokenFactory.contractId,
      creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
      expectedAdmin: validated.tokenFactory.expectedAdmin,
    },
    packageSelection: validated.packageSelection,
    authorizationInstanceId,
  } as const;
  const attemptId = hash(
    JSON.stringify({ version: HUMAN_PURCHASE_ATTEMPT_VERSION, purchase }),
  );
  const canonicalBytes = encodeBoundedHumanPurchaseCanonical(
    JSON.stringify({ ...purchase, attemptId }),
  );
  const result: HumanPurchaseCommitment = Object.freeze({
    attemptId,
    canonicalBytes,
    challengeId: validated.challengeId,
    commitment: hash(canonicalBytes),
    expiresAt: validated.expiresAt,
    requestCommitment: validated.binding.commitment,
    version: HUMAN_PURCHASE_COMMITMENT_VERSION,
  });
  bindHumanPurchaseAuthorities(
    validated,
    authorizationInstanceId,
    result,
    config,
  );
  registerAuthenticHumanPurchaseCommitment(result);
  return result;
}

export function createHumanPurchaseCommitter(
  candidate: HumanPurchaseTrustedConfiguration,
): HumanPurchaseCommitter {
  const config = validateHumanPurchaseConfiguration(candidate);
  return (input) =>
    commitWithAuthorization(
      input,
      config,
      `sha256:${randomBytes(32).toString("hex")}`,
    );
}

/** @internal Pinned-vector fixture only. */
export function commitHumanPurchaseForTest(
  input: HumanPurchaseCommitmentInput,
  candidate: HumanPurchaseTrustedConfiguration,
  authorizationInstanceId: string,
): HumanPurchaseCommitment {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("test-only human purchase committer is disabled");
  }
  const nonce = identifier(
    authorizationInstanceId,
    "human authorization instance",
    256,
  );
  return commitWithAuthorization(
    input,
    validateHumanPurchaseConfiguration(candidate),
    nonce,
  );
}

export {
  assertAuthenticHumanPurchase,
  registerRestoredHumanPurchaseCommitment,
} from "./human-purchase-commitment-authenticity.js";

export type {
  HumanPurchaseCommitment,
  HumanPurchaseCommitmentInput,
  HumanPurchaseCommitter,
  HumanPurchaseTrustedConfiguration,
} from "./human-purchase-commitment-types.js";
