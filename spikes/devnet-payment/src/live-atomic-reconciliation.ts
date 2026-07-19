import { createEvidenceRecord } from "@sotto/evidence";
import { commitHttpRequest } from "@sotto/x402-canton";
import { createHash } from "node:crypto";
import { reconcileAtomicPurchaseTransaction } from "./atomic-reconciliation.js";
import { readSpikeConfig } from "./config.js";
import { findCreatedContract } from "./daml-evidence.js";
import { createFiveNorthClient } from "./five-north.js";
import { policyIsActive } from "./live-atomic-evidence.js";
import { encodeSettlementProof, type SettlementProof } from "./provider.js";

const updatePattern = /^1220[0-9a-f]{64}$/;
const attemptPattern = /^sha256:[0-9a-f]{64}$/;
const [atomicUpdateId, attemptId, policyCreateUpdateId] = process.argv.slice(2);
if (
  atomicUpdateId === undefined ||
  !updatePattern.test(atomicUpdateId) ||
  policyCreateUpdateId === undefined ||
  !updatePattern.test(policyCreateUpdateId) ||
  attemptId === undefined ||
  !attemptPattern.test(attemptId)
) {
  throw new Error(
    "Usage: pnpm --filter @sotto/devnet-payment-spike run atomic:reconcile <atomic-update> <attempt> <policy-create-update>",
  );
}

const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const state = await client.loadSettlementState(config.payer.party);
const dsoParty = state.amuletRules.contract.payload.dso;
if (typeof dsoParty !== "string") {
  throw new Error("AmuletRules requires the DSO party");
}
const policyTransaction = await client.getTransaction(
  policyCreateUpdateId,
  config.payer.party,
);
const originalPolicy = findCreatedContract(
  policyTransaction,
  config.policy.packageId,
  "PurchasePolicyProbe",
);
const atomicTransaction = await client.getTransaction(
  atomicUpdateId,
  config.payer.party,
);
const resourceUrl = new URL(config.provider.resourceUrl);
const resourceHash = `sha256:${createHash("sha256")
  .update(`${resourceUrl.origin}${resourceUrl.pathname}`)
  .digest("hex")}` as const;
const proof: SettlementProof = {
  attemptId: attemptId as `sha256:${string}`,
  requestCommitment: commitHttpRequest({
    method: "GET",
    url: config.provider.resourceUrl,
  }).commitment,
  updateId: atomicUpdateId,
};
const expectation = {
  amuletRulesContractId: state.amuletRules.contract.contract_id,
  amuletRulesTemplateId: state.amuletRules.contract.template_id,
  agentParty: config.policy.agentParty,
  amount: "0.2500000000",
  dsoParty,
  ownerParty: config.policy.ownerParty,
  payerParty: config.payer.party,
  policyCid: originalPolicy.contractId,
  policyPackageId: config.policy.packageId,
  policyRevision: "0",
  providerParty: config.provider.party,
  remainingLimit: "0.7500000000",
  resourceHash,
  synchronizerId: state.amuletRules.domain_id,
} as const;
if (
  !reconcileAtomicPurchaseTransaction(atomicTransaction, proof, expectation)
) {
  throw new Error("Atomic settlement no longer reconciles");
}
const reducedPolicy = findCreatedContract(
  atomicTransaction,
  config.policy.packageId,
  "PurchasePolicyProbe",
);
if (reducedPolicy.createArgument.remainingLimit !== "0.7500000000") {
  throw new Error("Atomic policy allowance was unexpectedly restored");
}

let retryStatus: number | "network-error";
try {
  const response = await fetch(config.provider.resourceUrl, {
    headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(proof) },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  retryStatus = response.status;
  await response.arrayBuffer();
} catch {
  retryStatus = "network-error";
}
if (retryStatus === 200) {
  throw new Error(
    "Provider must be unavailable for the delivery-failure check",
  );
}
const afterFailure = await client.getTransaction(
  atomicUpdateId,
  config.payer.party,
);
if (!reconcileAtomicPurchaseTransaction(afterFailure, proof, expectation)) {
  throw new Error("Settlement changed after the provider delivery failure");
}
const offset = await client.getLedgerEnd();
if (
  !(await policyIsActive(
    client,
    config.policy.packageId,
    config.payer.party,
    reducedPolicy.contractId,
    offset,
  ))
) {
  throw new Error("Reduced policy is not active after delivery failure");
}

process.stdout.write(
  `${JSON.stringify(
    {
      evidence: createEvidenceRecord({
        attemptId,
        delivery: "failed",
        settlement: "accepted",
        updateId: atomicUpdateId,
      }),
      policyAllowanceRestored: false,
      reducedPolicyContractId: reducedPolicy.contractId,
      retryStatus,
      secondPaymentSubmitted: false,
      settlementReconciledAfterFailure: true,
    },
    null,
    2,
  )}\n`,
);
