import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  type BoundedPurchaseCommitment,
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  PURCHASE_COMMITMENT_VERSION,
  RESOURCE_BINDING_VERSION,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "./purchase-commitment.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { projectPurchasePackageSelection } from "./purchase-ledger-package-selection.js";
import { parseBoundedPurchaseCanonical } from "./purchase-ledger-intent-parser.js";
import {
  derivePurchaseAttemptId,
  purchaseSha256,
} from "./purchase-ledger-validation-primitives.js";
import {
  atomic,
  canonicalTime,
  identifier,
  REVISION_PATTERN,
} from "./purchase-commitment-primitives.js";
import { REQUEST_BINDING_VERSION } from "./request-binding.js";

export function projectBoundedPurchaseLedgerIntent(
  commitment: BoundedPurchaseCommitment,
): BoundedPurchaseLedgerIntent {
  const parsed = parseBoundedPurchaseCanonical(commitment);
  const {
    root,
    request,
    challenge,
    instrument,
    capability,
    tokenFactory,
    packageSelection: rawPackageSelection,
    packageRequirements,
    packageReferences,
  } = parsed;

  const attemptId = purchaseSha256(root.attemptId, "purchase attemptId");
  const requestCommitment = purchaseSha256(
    request.requestCommitment,
    "request commitment",
  );
  const bodyHash = purchaseSha256(request.bodyHash, "request body hash");
  const challengeId = purchaseSha256(challenge.challengeId, "challengeId");
  const resourceHash = purchaseSha256(capability.resourceHash, "resource hash");
  const requestedAt = identifier(challenge.observedAt, "challenge observedAt");
  const executeBefore = identifier(challenge.expiresAt, "challenge expiresAt");
  const capabilityExpiresAt = identifier(
    capability.expiresAt,
    "capability expiresAt",
  );
  const payerParty = identifier(challenge.payer, "challenge payer");
  const recipientParty = identifier(challenge.recipient, "challenge recipient");
  const feePayerParty = identifier(challenge.feePayer, "challenge fee payer");
  const agentParty = identifier(capability.agentParty, "capability agent");
  const network = identifier(challenge.network, "challenge network");
  if (!network.startsWith("canton:") || network.length === "canton:".length) {
    throw new Error("challenge network must identify a Canton network");
  }
  const amount = atomic(challenge.amountAtomic, "challenge amount");
  const perCall = atomic(capability.perCallLimitAtomic, "per-call limit");
  const remaining = atomic(
    capability.remainingAllowanceAtomic,
    "remaining allowance",
  );
  const maximumDebit = atomic(capability.maximumTotalDebitAtomic, "max debit");
  if (
    root.version !== PURCHASE_COMMITMENT_VERSION ||
    root.authorizationMode !== "bounded-capability" ||
    request.bindingVersion !== REQUEST_BINDING_VERSION ||
    challenge.x402Version !== 2 ||
    challenge.scheme !== "exact" ||
    challenge.transferMethod !== "transfer-factory" ||
    capability.templateId !==
      APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID ||
    capability.resourceBindingVersion !== RESOURCE_BINDING_VERSION ||
    tokenFactory.interfaceId !== TOKEN_TRANSFER_FACTORY_INTERFACE_ID ||
    tokenFactory.creationTemplateId !==
      FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID
  ) {
    throw new Error("bounded purchase canonical discriminator is unsupported");
  }
  identifier(root.authorizationInstanceId, "authorizationInstanceId", 256);
  if (
    typeof capability.revision !== "string" ||
    !REVISION_PATTERN.test(capability.revision)
  ) {
    throw new Error("capability revision is invalid");
  }
  const requestedAtMs = canonicalTime(requestedAt, "challenge observedAt");
  const executeBeforeMs = canonicalTime(executeBefore, "challenge expiresAt");
  const capabilityExpiresAtMs = canonicalTime(
    capabilityExpiresAt,
    "capability expiresAt",
  );
  const expectedAttemptId = derivePurchaseAttemptId(parsed);
  if (
    expectedAttemptId !== attemptId ||
    attemptId !== commitment.attemptId ||
    bodyHash !== commitment.bodyHash ||
    challengeId !== commitment.challengeId ||
    executeBefore !== commitment.expiresAt ||
    requestCommitment !== commitment.requestCommitment ||
    payerParty !== feePayerParty ||
    payerParty === agentParty ||
    recipientParty !== capability.recipient ||
    instrument.admin !== tokenFactory.expectedAdmin ||
    requestedAtMs >= executeBeforeMs ||
    executeBeforeMs > capabilityExpiresAtMs ||
    amount === 0n ||
    maximumDebit < perCall ||
    amount > perCall ||
    amount > remaining ||
    amount > maximumDebit
  ) {
    throw new Error("bounded purchase canonical semantics are inconsistent");
  }
  const packageSelection = projectPurchasePackageSelection(
    rawPackageSelection,
    packageRequirements,
    packageReferences,
    {
      adminParty: identifier(instrument.admin, "instrument admin"),
      agentParty,
      payerParty,
      recipientParty,
      synchronizerId: identifier(
        challenge.synchronizerId,
        "challenge synchronizer",
      ),
      requestedAt,
      executeBefore,
    },
  );

  return {
    version: PURCHASE_COMMITMENT_VERSION,
    authorizationMode: "bounded-capability",
    actAs: [agentParty],
    attemptId,
    purchaseCommitment: commitment.commitment,
    request: {
      bindingVersion: REQUEST_BINDING_VERSION,
      requestCommitment,
      bodyHash,
    },
    challenge: {
      x402Version: 2,
      challengeId,
      requestedAt,
      executeBefore,
      network: network as `canton:${string}`,
      scheme: "exact",
      transferMethod: "transfer-factory",
      payerParty,
      recipientParty,
      amountAtomic: challenge.amountAtomic as string,
      asset: identifier(challenge.asset, "challenge asset"),
      feePayerParty,
      instrument: {
        admin: identifier(instrument.admin, "instrument admin"),
        id: identifier(instrument.id, "instrument id"),
      },
      synchronizerId: identifier(
        challenge.synchronizerId,
        "challenge synchronizer",
      ),
    },
    capability: {
      agentParty,
      contractId: identifier(capability.contractId, "capability contractId"),
      templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
      expectedRevision: capability.revision,
      resourceBindingVersion: RESOURCE_BINDING_VERSION,
      resourceHash,
      recipientParty: identifier(capability.recipient, "capability recipient"),
      perCallLimitAtomic: capability.perCallLimitAtomic as string,
      remainingAllowanceAtomic: capability.remainingAllowanceAtomic as string,
      maximumTotalDebitAtomic: capability.maximumTotalDebitAtomic as string,
      expiresAt: capabilityExpiresAt,
    },
    tokenFactory: {
      interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
      contractId: identifier(
        tokenFactory.contractId,
        "tokenFactory contractId",
      ),
      creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
      expectedAdmin: identifier(
        tokenFactory.expectedAdmin,
        "tokenFactory expected admin",
      ),
    },
    packageSelection,
  };
}
