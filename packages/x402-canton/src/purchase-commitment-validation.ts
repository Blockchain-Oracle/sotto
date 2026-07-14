import type { CantonPaymentRequirement } from "./payment-requirement.js";
import type { PurchaseCapabilitySnapshot } from "./purchase-capability-event.js";
import { readPurchaseCapabilityObservation } from "./purchase-capability-observation.js";
import type { BoundedPurchaseCommitmentInput } from "./purchase-commitment.js";
import { validatePurchasePackageSelection } from "./purchase-package-selection-validation.js";
import type { CanonicalPurchasePackageSelection } from "./purchase-package-selection-types.js";
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
} from "./purchase-commitment-primitives.js";
import {
  commitResourceRoute,
  RESOURCE_BINDING_VERSION,
} from "./resource-route.js";
export { RESOURCE_BINDING_VERSION } from "./resource-route.js";

export const TOKEN_TRANSFER_FACTORY_INTERFACE_ID =
  "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory" as const;
export const FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID =
  "a5b055492fb8f08b2e7bc0fc94da6da50c39c2e1d7f24cd5ea8db12fc87c1332:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules" as const;
export const MAX_PURCHASE_WINDOW_SECONDS = 600;

export type ValidatedPurchaseInput = Readonly<{
  capability: PurchaseCapabilitySnapshot;
  challengeId: `sha256:${string}`;
  expiresAt: string;
  observedAt: string;
  packageSelection: CanonicalPurchasePackageSelection;
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
      "packageSelection",
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

  const { snapshot: capability } = readPurchaseCapabilityObservation(
    input.capability,
  );
  if (capability.payerParty !== input.payerParty) {
    throw new Error("capability payer does not match challenge payer");
  }
  if (capability.agentParty === capability.payerParty) {
    throw new Error("capability agent must differ from payer");
  }
  if (capability.paused) {
    throw new Error("capability is paused");
  }
  if (
    capability.instrument.admin !== requirement.extra.instrumentId.admin ||
    capability.instrument.id !== requirement.extra.instrumentId.id
  ) {
    throw new Error(
      "capability instrument does not match challenge instrument",
    );
  }
  const amount = atomic(requirement.amount, "challenge amount");
  const perCall = atomic(capability.perCallLimitAtomic, "per-call limit");
  const remaining = atomic(
    capability.remainingAllowanceAtomic,
    "remaining allowance",
  );
  const maximumDebit = atomic(
    capability.maximumTotalDebitAtomic,
    "maximum total debit",
  );
  if (maximumDebit < perCall) {
    throw new Error("maximum total debit must cover per-call limit");
  }
  if (amount === 0n) throw new Error("challenge amount must be positive");
  if (amount > perCall) throw new Error("amount exceeds per-call limit");
  if (amount > remaining) throw new Error("amount exceeds remaining allowance");
  if (amount > maximumDebit)
    throw new Error("amount exceeds maximum total debit");
  if (capability.recipient !== requirement.payTo) {
    throw new Error("capability recipient does not match challenge recipient");
  }
  if (capability.resourceBindingVersion !== RESOURCE_BINDING_VERSION) {
    throw new Error("capability resource binding version is unsupported");
  }
  const expectedResourceHash = commitResourceRoute(requestUrl.toString());
  if (capability.resourceHash !== expectedResourceHash) {
    throw new Error("capability resource hash does not match request route");
  }
  if (
    canonicalTime(capability.expiresAt, "capability expiresAt") <
    Date.parse(expiresAt)
  ) {
    throw new Error("capability expiresAt precedes challenge expiry");
  }

  const tokenFactory = objectValue(input.tokenFactory, "tokenFactory");
  exactKeys(
    tokenFactory,
    ["contractId", "creationTemplateId", "expectedAdmin", "interfaceId"],
    "tokenFactory",
  );
  if (input.tokenFactory.interfaceId !== TOKEN_TRANSFER_FACTORY_INTERFACE_ID) {
    throw new Error("tokenFactory interface is not the pinned TransferFactory");
  }
  identifier(input.tokenFactory.contractId, "tokenFactory contractId");
  if (
    input.tokenFactory.creationTemplateId !==
    FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID
  ) {
    throw new Error("tokenFactory creation template is not approved");
  }
  identifier(input.tokenFactory.expectedAdmin, "tokenFactory expected admin");
  if (capability.transferFactoryContractId !== input.tokenFactory.contractId) {
    throw new Error("capability transfer factory does not match tokenFactory");
  }
  if (capability.expectedAdmin !== input.tokenFactory.expectedAdmin) {
    throw new Error("capability expected admin does not match tokenFactory");
  }
  if (
    input.tokenFactory.expectedAdmin !== requirement.extra.instrumentId.admin
  ) {
    throw new Error("tokenFactory expected admin does not match instrument");
  }
  const packageSelection = validatePurchasePackageSelection(
    input.packageSelection,
    {
      adminParty: requirement.extra.instrumentId.admin,
      agentParty: capability.agentParty,
      payerParty: input.payerParty,
      providerParty: requirement.payTo,
      synchronizerId: requirement.extra.synchronizerId,
      challengeObservedAt: observation.observedAt,
      executeBefore: expiresAt,
    },
  );
  return {
    capability,
    challengeId: observation.challengeId,
    expiresAt,
    observedAt: observation.observedAt,
    packageSelection,
    requirement,
  };
}
