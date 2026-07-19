import { readHumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
import { readHumanPaymentAuthority } from "./human-payment-observation.js";
import type {
  HumanPurchaseCommitmentInput,
  HumanPurchaseTrustedConfiguration,
  ValidatedHumanPurchaseInput,
} from "./human-purchase-commitment-types.js";
import { validateHumanPurchasePackageSelection } from "./human-purchase-package-selection.js";
import { readPaymentRequiredObservation } from "./payment-observation.js";
import {
  selectRequirement,
  validateBinding,
} from "./purchase-commitment-envelope.js";
import {
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  MAX_PURCHASE_WINDOW_SECONDS,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "./purchase-commitment-validation.js";
import {
  atomic,
  canonicalTime,
  exactKeys,
  objectValue,
} from "./purchase-commitment-primitives.js";
export const MIN_HUMAN_SIGNING_RESERVE_MS = 120_000;

export function validateHumanPurchaseInput(
  input: HumanPurchaseCommitmentInput,
  config: HumanPurchaseTrustedConfiguration,
): ValidatedHumanPurchaseInput {
  const root = objectValue(input, "human purchase commitment input");
  exactKeys(
    root,
    [
      "maximumFeeAtomic",
      "packageSelection",
      "paymentObservation",
      "walletPreflight",
    ],
    "human purchase commitment input",
  );
  const snapshot = Object.freeze({
    maximumFeeAtomic: input.maximumFeeAtomic,
    packageSelection: input.packageSelection,
    paymentObservation: input.paymentObservation,
    walletPreflight: input.walletPreflight,
  });
  const walletAuthority = readHumanWalletConnectorPreflightAuthority(
    snapshot.walletPreflight,
  );
  const identity = walletAuthority.identity;
  const now = Date.now();
  const payment = readHumanPaymentAuthority(snapshot.paymentObservation);
  const observation = readPaymentRequiredObservation(
    payment.paymentObservation,
  );
  if (
    snapshot.paymentObservation.challengeId !== observation.challengeId ||
    snapshot.paymentObservation.observedAt !== observation.observedAt ||
    snapshot.paymentObservation.requestCommitment !== payment.binding.commitment
  ) {
    throw new Error("human payment observation authority is inconsistent");
  }
  const envelope = {
    binding: payment.binding,
    expectedNetwork: identity.network,
    payerParty: identity.party,
  };
  const request = validateBinding(envelope);
  const requirement = selectRequirement(
    envelope,
    request.url,
    observation.challengeBytes,
  );
  if (requirement.extra.synchronizerId !== identity.synchronizerId) {
    throw new Error("human payer synchronizer does not match the challenge");
  }
  if (
    requirement.maxTimeoutSeconds > MAX_PURCHASE_WINDOW_SECONDS ||
    requirement.extra.executeBeforeSeconds > MAX_PURCHASE_WINDOW_SECONDS
  ) {
    throw new Error("human purchase window exceeds 600 seconds");
  }
  const observedAtMs = canonicalTime(observation.observedAt, "observedAt");
  const expiresAtMs =
    observedAtMs +
    Math.min(
      requirement.maxTimeoutSeconds,
      requirement.extra.executeBeforeSeconds,
    ) *
      1_000;
  if (
    !Number.isSafeInteger(expiresAtMs) ||
    observedAtMs > now ||
    expiresAtMs - now < MIN_HUMAN_SIGNING_RESERVE_MS
  ) {
    throw new Error("human purchase lacks the required signing reserve");
  }
  const expiresAt = new Date(expiresAtMs).toISOString();
  const principal = atomic(requirement.amount, "human purchase amount");
  const maximumFee = atomic(snapshot.maximumFeeAtomic, "maximum human fee");
  const allowedFee = atomic(
    config.maximumAllowedFeeAtomic,
    "maximum allowed human fee",
  );
  if (principal === 0n)
    throw new Error("human purchase amount must be positive");
  if (maximumFee > allowedFee) {
    throw new Error("maximum human fee exceeds the trusted platform ceiling");
  }
  const maximumTotalDebitAtomic = (principal + maximumFee).toString();
  if (maximumTotalDebitAtomic.length > 38) {
    throw new Error("maximum human debit exceeds the bounded atomic range");
  }
  if (
    config.expectedAsset !== requirement.asset ||
    config.expectedAdmin !== requirement.extra.instrumentId.admin ||
    config.expectedInstrumentId !== requirement.extra.instrumentId.id ||
    config.expectedAdmin === identity.party ||
    config.contractId === ""
  ) {
    throw new Error("human token factory does not match the challenge");
  }
  const packageSelection = validateHumanPurchasePackageSelection(
    snapshot.packageSelection,
    {
      adminParty: config.expectedAdmin,
      challengeId: observation.challengeId,
      executeBefore: expiresAt,
      identity,
      observedAt: observation.observedAt,
      providerParty: requirement.payTo,
      walletPreflight: snapshot.walletPreflight,
    },
  );
  if (packageSelection.packageIds[0] !== walletAuthority.expectedPackageId) {
    throw new Error("human wallet package does not match the live selection");
  }
  return Object.freeze({
    authorities: Object.freeze({
      packageSelection: snapshot.packageSelection,
      paymentObservation: snapshot.paymentObservation,
      walletPreflight: snapshot.walletPreflight,
    }),
    binding: payment.binding,
    challengeId: observation.challengeId,
    expiresAt,
    identity,
    maximumFeeAtomic: maximumFee.toString(),
    maximumTotalDebitAtomic,
    observedAt: observation.observedAt,
    packageSelection,
    requestDisplay: Object.freeze({
      method: request.method,
      queryPresent: request.url.search !== "",
      resourceOrigin: request.url.origin,
      resourcePath: request.url.pathname,
    }),
    requirement,
    tokenFactory: Object.freeze({
      contractId: config.contractId,
      expectedAdmin: config.expectedAdmin,
      creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
      interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
    }),
  });
}
