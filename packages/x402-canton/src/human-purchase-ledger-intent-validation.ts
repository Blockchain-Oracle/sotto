import {
  HUMAN_PURCHASE_COMMITMENT_VERSION,
  type HumanPurchaseCommitment,
} from "./human-purchase-commitment.js";
import type { HumanPurchaseCommandAuthority } from "./human-purchase-authority.js";
import { parseHumanPurchaseCanonical } from "./human-purchase-ledger-intent-parser.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent-types.js";
import { projectHumanLedgerPackageSelection } from "./human-purchase-ledger-package.js";
import {
  deriveHumanPurchaseAttemptId,
  humanLedgerSha256,
  projectHumanPayerSigningIdentity,
} from "./human-purchase-ledger-validation-primitives.js";
import {
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "./purchase-commitment-validation.js";
import {
  atomic,
  canonicalTime,
  identifier,
} from "./purchase-commitment-primitives.js";
import { REQUEST_BINDING_VERSION } from "./request-binding.js";

export function projectHumanPurchaseLedgerIntent(
  commitment: HumanPurchaseCommitment,
  authority: HumanPurchaseCommandAuthority,
): HumanPurchaseLedgerIntent {
  const parsed = parseHumanPurchaseCanonical(commitment);
  const { root, request, challenge, instrument, limits, tokenFactory } = parsed;
  const identity = projectHumanPayerSigningIdentity(parsed.payerIdentity);
  const requestedAt = identifier(challenge.observedAt, "challenge observedAt");
  const executeBefore = identifier(challenge.expiresAt, "challenge expiresAt");
  const requestedAtMs = canonicalTime(requestedAt, "challenge observedAt");
  const executeBeforeMs = canonicalTime(executeBefore, "challenge expiresAt");
  const payerParty = identifier(challenge.payer, "challenge payer");
  const recipientParty = identifier(challenge.recipient, "challenge recipient");
  const feePayerParty = identifier(challenge.feePayer, "challenge fee payer");
  const adminParty = identifier(instrument.admin, "instrument admin");
  const synchronizerId = identifier(
    challenge.synchronizerId,
    "challenge synchronizer",
  );
  const amount = atomic(challenge.amountAtomic, "human purchase amount");
  const maximumFee = atomic(limits.maximumFeeAtomic, "maximum human fee");
  const maximumDebit = atomic(
    limits.maximumTotalDebitAtomic,
    "maximum human debit",
  );
  const attemptId = humanLedgerSha256(
    root.attemptId,
    "human purchase attemptId",
  );
  const challengeId = humanLedgerSha256(
    challenge.challengeId,
    "human challengeId",
  );
  const requestCommitment = humanLedgerSha256(
    request.requestCommitment,
    "human request commitment",
  );
  const bodyHash = humanLedgerSha256(
    request.bodyHash,
    "human request body hash",
  );
  const contractId = identifier(
    tokenFactory.contractId,
    "human token factory contractId",
  );
  const expectedAdmin = identifier(
    tokenFactory.expectedAdmin,
    "human token factory expected admin",
  );
  identifier(root.authorizationInstanceId, "human authorization instance", 256);
  if (
    root.version !== HUMAN_PURCHASE_COMMITMENT_VERSION ||
    root.authorizationMode !== "human-wallet" ||
    request.bindingVersion !== REQUEST_BINDING_VERSION ||
    challenge.x402Version !== 2 ||
    challenge.scheme !== "exact" ||
    challenge.transferMethod !== "transfer-factory" ||
    challenge.asset !== "CC" ||
    instrument.id !== "Amulet" ||
    tokenFactory.interfaceId !== TOKEN_TRANSFER_FACTORY_INTERFACE_ID ||
    tokenFactory.creationTemplateId !==
      FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID
  ) {
    throw new Error("human purchase canonical discriminator is unsupported");
  }
  if (
    attemptId !== deriveHumanPurchaseAttemptId(parsed) ||
    attemptId !== commitment.attemptId ||
    challengeId !== commitment.challengeId ||
    requestCommitment !== commitment.requestCommitment ||
    executeBefore !== commitment.expiresAt ||
    payerParty !== identity.party ||
    feePayerParty !== payerParty ||
    challenge.network !== identity.network ||
    synchronizerId !== identity.synchronizerId ||
    adminParty !== expectedAdmin ||
    adminParty === payerParty ||
    recipientParty === payerParty ||
    recipientParty === adminParty ||
    canonicalTime(identity.acquiredAt, "human payer acquiredAt") >
      requestedAtMs ||
    requestedAtMs >= executeBeforeMs ||
    amount === 0n ||
    maximumDebit !== amount + maximumFee
  ) {
    throw new Error("human purchase canonical semantics are inconsistent");
  }
  const packageSelection = projectHumanLedgerPackageSelection(
    parsed.packageSelection,
    parsed.packageReference,
    {
      adminParty,
      executeBefore,
      payerParty,
      providerParty: recipientParty,
      requestedAt,
      subjectHash: identity.subjectHash,
      synchronizerId,
    },
  );
  if (
    JSON.stringify(identity) !== JSON.stringify(authority.payerIdentity) ||
    JSON.stringify(packageSelection) !==
      JSON.stringify(authority.packageSelection)
  ) {
    throw new Error("human purchase authority projection is inconsistent");
  }
  return {
    version: HUMAN_PURCHASE_COMMITMENT_VERSION,
    authorizationMode: "human-wallet",
    actAs: [payerParty],
    attemptId,
    purchaseCommitment: humanLedgerSha256(
      commitment.commitment,
      "human purchase commitment",
    ),
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
      network: identity.network,
      scheme: "exact",
      transferMethod: "transfer-factory",
      payerParty,
      recipientParty,
      amountAtomic: amount.toString(),
      asset: "CC",
      feePayerParty,
      instrument: { admin: adminParty, id: "Amulet" },
      synchronizerId,
    },
    payerIdentity: identity,
    limits: {
      maximumFeeAtomic: maximumFee.toString(),
      maximumTotalDebitAtomic: maximumDebit.toString(),
    },
    tokenFactory: {
      interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
      contractId,
      creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
      expectedAdmin,
    },
    packageSelection,
  };
}
