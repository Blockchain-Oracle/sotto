import { createEvidenceRecord } from "@sotto/evidence";
import {
  commitHttpRequest,
  createPaymentAuthorization,
} from "@sotto/x402-canton";
import { createHash } from "node:crypto";
import { reconcileAtomicPurchaseTransaction } from "./atomic-reconciliation.js";
import { buildAtomicPurchaseRequest } from "./atomic-purchase.js";
import { readSpikeConfig } from "./config.js";
import { buildCreatePolicyRequest } from "./daml-commands.js";
import { findCreatedContract } from "./daml-evidence.js";
import { createFiveNorthClient } from "./five-north.js";
import { matchesLedgerRejection } from "./ledger-rejection.js";
import { observeHttpChallenge } from "./http-observer.js";
import {
  buildRollbackRequest,
  policyIsActive,
  readAtomicVisibility,
} from "./live-atomic-evidence.js";
import {
  createPaidResourceHandler,
  encodeSettlementProof,
  startPaidProvider,
  type SettlementProof,
} from "./provider.js";
import { atomicToDecimal } from "./settlement.js";

const amount = "2500000000";
const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const initialState = await client.loadSettlementState(config.payer.party);
const dsoParty = initialState.amuletRules.contract.payload.dso;
if (typeof dsoParty !== "string") {
  throw new Error("AmuletRules requires the DSO party");
}
const parties = {
  agent: config.policy.agentParty,
  owner: config.policy.ownerParty,
  payer: config.payer.party,
  provider: config.provider.party,
} as const;
const expectedBase = {
  agentParty: parties.agent,
  amount: atomicToDecimal(amount),
  dsoParty,
  ownerParty: parties.owner,
  payerParty: parties.payer,
  policyRevision: "0",
  providerParty: parties.provider,
  remainingLimit: "0.7500000000",
  synchronizerId: initialState.amuletRules.domain_id,
} as const;
let policyCid: string | undefined;
let resourceHash: `sha256:${string}` | undefined;

async function verifySettlement(proof: SettlementProof): Promise<boolean> {
  if (policyCid === undefined || resourceHash === undefined) return false;
  try {
    const transaction = await client.getTransaction(
      proof.updateId,
      parties.payer,
    );
    return reconcileAtomicPurchaseTransaction(transaction, proof, {
      ...expectedBase,
      policyCid,
      resourceHash,
    });
  } catch {
    return false;
  }
}

const handler = createPaidResourceHandler({
  amount,
  dsoParty,
  maxTimeoutSeconds: 120,
  payerParty: parties.payer,
  providerParty: parties.provider,
  resourceUrl: config.provider.resourceUrl,
  synchronizerId: initialState.amuletRules.domain_id,
  verifySettlement,
});
const server = await startPaidProvider({
  handler,
  port: 8_788,
  resourceUrl: config.provider.resourceUrl,
});

try {
  const observation = await observeHttpChallenge({
    authorizeUrl: async (url) => {
      if (
        url.toString() !== config.provider.resourceUrl ||
        !url.hostname.endsWith(".trycloudflare.com")
      ) {
        throw new Error(
          "Atomic provider must use the configured Cloudflare tunnel",
        );
      }
    },
    fetcher: fetch,
    method: "GET",
    resourceUrl: config.provider.resourceUrl,
    timeoutMs: 10_000,
  });
  const binding = commitHttpRequest({
    method: "GET",
    url: config.provider.resourceUrl,
  });
  const authorization = createPaymentAuthorization({
    authorizationInstanceId: config.payer.purchaseId,
    binding,
    carriedRequestCommitment: observation.requestCommitment,
    observedAt: observation.observedAt,
    payerParty: parties.payer,
    requirement: observation.challenge,
  });
  const resourceUrl = new URL(config.provider.resourceUrl);
  resourceHash = `sha256:${createHash("sha256")
    .update(`${resourceUrl.origin}${resourceUrl.pathname}`)
    .digest("hex")}`;
  const attemptHash = authorization.attemptId.slice("sha256:".length);
  const userId = await client.getUserId();
  const policyCreate = await client.submitSettlement(
    buildCreatePolicyRequest({
      commandId: `sotto-atomic-policy-${attemptHash}`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      parties,
      resourceHash,
      userId,
    }),
  );
  const policyTransaction = await client.getTransaction(
    policyCreate.updateId,
    parties.payer,
  );
  policyCid = findCreatedContract(
    policyTransaction,
    "sotto-control",
    "PurchasePolicyProbe",
  ).contractId;
  const purchase = buildAtomicPurchaseRequest({
    amuletRules: initialState.amuletRules,
    authorization,
    now: new Date(),
    openMiningRounds: initialState.openMiningRounds,
    parties,
    payerHolding: initialState.payerHolding,
    policyCid,
    resourceHash,
    userId,
  });
  const rollback = buildRollbackRequest(purchase, attemptHash);
  let rollbackRejected = false;
  try {
    await client.submitSettlement(rollback);
  } catch (error) {
    rollbackRejected = matchesLedgerRejection(error, {
      reason: "amount exceeds per-call limit",
      status: 400,
    });
  }
  const afterRollback = await client.loadSettlementState(parties.payer);
  const rollbackPreservedHolding =
    afterRollback.payerHolding.contractId ===
      initialState.payerHolding.contractId &&
    afterRollback.payerHolding.amount === initialState.payerHolding.amount;
  const rollbackOffset = await client.getLedgerEnd();
  const rollbackPreservedPolicy = await policyIsActive(
    client,
    parties.payer,
    policyCid,
    rollbackOffset,
  );
  if (
    !rollbackRejected ||
    !rollbackPreservedHolding ||
    !rollbackPreservedPolicy
  ) {
    throw new Error("Failed atomic command did not prove complete rollback");
  }
  const accepted = await client.submitSettlement(
    buildAtomicPurchaseRequest({
      amuletRules: afterRollback.amuletRules,
      authorization,
      now: new Date(),
      openMiningRounds: afterRollback.openMiningRounds,
      parties,
      payerHolding: afterRollback.payerHolding,
      policyCid,
      resourceHash,
      userId,
    }),
  );
  const proof: SettlementProof = {
    attemptId: authorization.attemptId,
    requestCommitment: authorization.requestCommitment,
    updateId: accepted.updateId,
  };
  const acceptedTransaction = await client.getTransaction(
    accepted.updateId,
    parties.payer,
  );
  if (
    !reconcileAtomicPurchaseTransaction(acceptedTransaction, proof, {
      ...expectedBase,
      policyCid,
      resourceHash,
    })
  ) {
    throw new Error("Accepted atomic purchase could not be reconciled");
  }
  const reducedPolicy = findCreatedContract(
    acceptedTransaction,
    "sotto-control",
    "PurchasePolicyProbe",
  );
  const context = findCreatedContract(
    acceptedTransaction,
    "sotto-control",
    "PurchaseContextProbe",
  );
  const signature = encodeSettlementProof(proof);
  const paidStatuses: number[] = [];
  for (let retry = 0; retry < 2; retry += 1) {
    const response = await fetch(config.provider.resourceUrl, {
      headers: { "PAYMENT-SIGNATURE": signature },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    paidStatuses.push(response.status);
    await response.arrayBuffer();
  }
  if (paidStatuses.some((status) => status !== 200)) {
    throw new Error("Atomic payment proof did not deliver authentic retries");
  }
  const evidenceOffset = await client.getLedgerEnd();
  const readers = {
    agent: parties.agent,
    outsider: config.policy.outsiderParty,
    owner: parties.owner,
    payer: parties.payer,
    provider: parties.provider,
  } as const;
  const visibility = await readAtomicVisibility({
    attemptId: proof.attemptId,
    client,
    offset: evidenceOffset,
    readers,
    reducedPolicyCid: reducedPolicy.contractId,
  });
  const expectedVisibility = {
    agent: { context: 1, policy: 1 },
    outsider: { context: 0, policy: 0 },
    owner: { context: 1, policy: 1 },
    payer: { context: 1, policy: 1 },
    provider: { context: 1, policy: 0 },
  };
  if (JSON.stringify(visibility) !== JSON.stringify(expectedVisibility)) {
    throw new Error(
      "Atomic purchase visibility did not match the authority design",
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        atomicWithPayment: true,
        atomicUpdateId: accepted.updateId,
        contextContractId: context.contractId,
        evidence: createEvidenceRecord({
          attemptId: authorization.attemptId,
          delivery: "succeeded",
          settlement: "accepted",
          updateId: accepted.updateId,
        }),
        http: [402, ...paidStatuses],
        packageId: config.policy.packageId,
        policyCreateUpdateId: policyCreate.updateId,
        reducedPolicyContractId: reducedPolicy.contractId,
        rollback: {
          holdingPreserved: rollbackPreservedHolding,
          policyPreserved: rollbackPreservedPolicy,
          rejected: rollbackRejected,
        },
        visibility,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await server.close();
}
