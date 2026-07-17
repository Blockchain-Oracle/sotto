import type { HashVerifiedHumanPreparedPurchase } from "./human-prepared-purchase-hash.js";
import { readHashVerifiedHumanPreparedPurchase } from "./human-prepared-purchase-hash-state.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";

export const HUMAN_PURCHASE_APPROVAL_VERSION =
  "sotto-human-purchase-approval-v1" as const;

export type HumanPreparedPurchaseApproval = Readonly<{
  version: typeof HUMAN_PURCHASE_APPROVAL_VERSION;
  action: "pay-for-api-call";
  authorizationMode: "human-wallet";
  method: string;
  resourceOrigin: string;
  resourcePath: string;
  queryPresent: boolean;
  payerParty: string;
  providerParty: string;
  amountAtomic: string;
  asset: "CC";
  maximumFeeAtomic: string;
  maximumTotalDebitAtomic: string;
  instrument: HumanPurchaseLedgerIntent["challenge"]["instrument"];
  network: `canton:${string}`;
  synchronizerId: string;
  executeBefore: string;
  attemptId: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  bodyHash: `sha256:${string}`;
  preparedTransactionHash: `sha256:${string}`;
  selectedPackage: Readonly<{
    packageId: string;
    packageName: "splice-amulet";
    packageVersion: string;
  }>;
  tokenFactory: Readonly<{ contractId: string; expectedAdmin: string }>;
  signer: Readonly<{
    publicKeyFingerprint: `1220${string}`;
    publicKeyFormat: HumanPurchaseLedgerIntent["payerIdentity"]["publicKeyFormat"];
    signatureFormat: HumanPurchaseLedgerIntent["payerIdentity"]["signatureFormat"];
    signingAlgorithm: HumanPurchaseLedgerIntent["payerIdentity"]["signingAlgorithm"];
  }>;
}>;

export function projectHumanPreparedPurchaseApproval(
  verified: HashVerifiedHumanPreparedPurchase,
): HumanPreparedPurchaseApproval {
  const state = readHashVerifiedHumanPreparedPurchase(verified);
  const { intent } = state;
  const selected = intent.packageSelection.references[0];
  return Object.freeze({
    version: HUMAN_PURCHASE_APPROVAL_VERSION,
    action: "pay-for-api-call",
    authorizationMode: "human-wallet",
    method: intent.request.method,
    resourceOrigin: intent.request.resourceOrigin,
    resourcePath: intent.request.resourcePath,
    queryPresent: intent.request.queryPresent,
    payerParty: intent.challenge.payerParty,
    providerParty: intent.challenge.recipientParty,
    amountAtomic: intent.challenge.amountAtomic,
    asset: "CC",
    maximumFeeAtomic: intent.limits.maximumFeeAtomic,
    maximumTotalDebitAtomic: intent.limits.maximumTotalDebitAtomic,
    instrument: Object.freeze({ ...intent.challenge.instrument }),
    network: intent.challenge.network,
    synchronizerId: intent.challenge.synchronizerId,
    executeBefore: intent.challenge.executeBefore,
    attemptId: intent.attemptId,
    challengeId: intent.challenge.challengeId,
    requestCommitment: intent.request.requestCommitment,
    purchaseCommitment: intent.purchaseCommitment,
    bodyHash: intent.request.bodyHash,
    preparedTransactionHash: `sha256:${Buffer.from(
      state.preparedTransactionHash,
    ).toString("hex")}`,
    selectedPackage: Object.freeze({
      packageId: selected.packageId,
      packageName: selected.packageName,
      packageVersion: selected.packageVersion,
    }),
    tokenFactory: Object.freeze({
      contractId: intent.tokenFactory.contractId,
      expectedAdmin: intent.tokenFactory.expectedAdmin,
    }),
    signer: Object.freeze({
      publicKeyFingerprint: intent.payerIdentity.publicKeyFingerprint,
      publicKeyFormat: intent.payerIdentity.publicKeyFormat,
      signatureFormat: intent.payerIdentity.signatureFormat,
      signingAlgorithm: intent.payerIdentity.signingAlgorithm,
    }),
  });
}
