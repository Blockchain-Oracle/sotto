import type { PrepareOnlyHumanPurchaseResult } from "./prepare-only-human-purchase.js";

export function projectLiveFiveNorthHumanPrepareOutput(
  sourceCommit: string,
  result: PrepareOnlyHumanPurchaseResult,
) {
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error("live human preparation source commit is invalid");
  }
  const approval = result.approval;
  return Object.freeze({
    schema: "sotto-five-north-human-prepare-only-v1" as const,
    sourceCommit,
    status: result.status,
    approval: Object.freeze({
      version: approval.version,
      action: approval.action,
      authorizationMode: approval.authorizationMode,
      method: approval.method,
      resourcePath: approval.resourcePath,
      queryPresent: approval.queryPresent,
      payerParty: approval.payerParty,
      providerParty: approval.providerParty,
      amountAtomic: approval.amountAtomic,
      asset: approval.asset,
      maximumFeeAtomic: approval.maximumFeeAtomic,
      maximumTotalDebitAtomic: approval.maximumTotalDebitAtomic,
      network: approval.network,
      synchronizerId: approval.synchronizerId,
      executeBefore: approval.executeBefore,
      attemptId: approval.attemptId,
      challengeId: approval.challengeId,
      requestCommitment: approval.requestCommitment,
      purchaseCommitment: approval.purchaseCommitment,
      preparedTransactionHash: approval.preparedTransactionHash,
      selectedPackage: Object.freeze({
        packageId: approval.selectedPackage.packageId,
        packageName: approval.selectedPackage.packageName,
        packageVersion: approval.selectedPackage.packageVersion,
      }),
      tokenFactory: Object.freeze({
        contractId: approval.tokenFactory.contractId,
        expectedAdmin: approval.tokenFactory.expectedAdmin,
      }),
      signer: Object.freeze({
        publicKeyFingerprint: approval.signer.publicKeyFingerprint,
      }),
    }),
  });
}
