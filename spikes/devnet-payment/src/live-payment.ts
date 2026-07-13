import { createEvidenceRecord } from "@sotto/evidence";
import {
  commitHttpRequest,
  createPaymentAuthorization,
} from "@sotto/x402-canton";
import { readSpikeConfig } from "./config.js";
import { createFiveNorthClient } from "./five-north.js";
import { observeHttpChallenge } from "./http-observer.js";
import { requireMatchedRequestBinding } from "./observation.js";
import {
  createPaidResourceHandler,
  encodeSettlementProof,
  startPaidProvider,
  type SettlementProof,
} from "./provider.js";
import { reconcileSettlementTransaction } from "./reconciliation.js";
import { atomicToDecimal, buildSettlementRequest } from "./settlement.js";

const amount = "2500000000";
const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const state = await client.loadSettlementState(config.payer.party);
const dsoParty = state.amuletRules.contract.payload.dso;
if (typeof dsoParty !== "string") {
  throw new Error("AmuletRules requires the DSO party");
}
const expected = {
  amuletRulesContractId: state.amuletRules.contract.contract_id,
  amuletRulesTemplateId: state.amuletRules.contract.template_id,
  amount: atomicToDecimal(amount),
  dsoParty,
  payerParty: config.payer.party,
  providerParty: config.provider.party,
  synchronizerId: state.amuletRules.domain_id,
} as const;

async function verifySettlement(proof: SettlementProof): Promise<boolean> {
  try {
    const transaction = await client.getTransaction(
      proof.updateId,
      config.provider.party,
    );
    return reconcileSettlementTransaction(transaction, proof, expected);
  } catch {
    return false;
  }
}

const handler = createPaidResourceHandler({
  amount,
  dsoParty,
  maxTimeoutSeconds: 120,
  payerParty: config.payer.party,
  providerParty: config.provider.party,
  resourceUrl: config.provider.resourceUrl,
  synchronizerId: state.amuletRules.domain_id,
  verifySettlement,
});
const server = await startPaidProvider({
  handler,
  port: 8_787,
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
          "Live provider must use the configured Cloudflare tunnel",
        );
      }
    },
    fetcher: fetch,
    method: "GET",
    resourceUrl: config.provider.resourceUrl,
    timeoutMs: 10_000,
  });
  requireMatchedRequestBinding(observation);
  const binding = commitHttpRequest({
    method: "GET",
    url: config.provider.resourceUrl,
  });
  const authorization = createPaymentAuthorization({
    authorizationInstanceId: config.payer.purchaseId,
    binding,
    carriedRequestCommitment: observation.requestCommitment,
    observedAt: observation.observedAt,
    payerParty: config.payer.party,
    requirement: observation.challenge,
  });
  const settlementRequest = buildSettlementRequest({
    amuletRules: state.amuletRules,
    authorization,
    now: new Date(),
    openMiningRounds: state.openMiningRounds,
    payerHolding: state.payerHolding,
    providerParty: config.provider.party,
    userId: state.userId,
  });
  const settlement = await client.submitSettlement(settlementRequest);
  const proof: SettlementProof = {
    attemptId: authorization.attemptId,
    requestCommitment: authorization.requestCommitment,
    updateId: settlement.updateId,
  };
  if (!(await verifySettlement(proof))) {
    throw new Error("Accepted settlement could not be reconciled");
  }
  const paidResponse = await fetch(config.provider.resourceUrl, {
    headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(proof) },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (paidResponse.status !== 200) {
    throw new Error(`Paid retry returned HTTP ${paidResponse.status}`);
  }
  const responseBytes = new Uint8Array(await paidResponse.arrayBuffer());
  if (responseBytes.byteLength > 2_000_000) {
    throw new Error("Paid response exceeds 2000000 bytes");
  }
  const evidence = createEvidenceRecord({
    attemptId: authorization.attemptId,
    delivery: "succeeded",
    settlement: "accepted",
    updateId: settlement.updateId,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        compatibility: observation.compatibility,
        evidence,
        http: [402, 200],
        localProvider: server.localUrl,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await server.close();
}
