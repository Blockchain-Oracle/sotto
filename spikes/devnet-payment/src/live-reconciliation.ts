import { commitHttpRequest } from "@sotto/x402-canton";
import { readSpikeConfig } from "./config.js";
import { createFiveNorthClient } from "./five-north.js";
import {
  createPaidResourceHandler,
  encodeSettlementProof,
  startPaidProvider,
  type SettlementProof,
} from "./provider.js";
import {
  evaluateReconciliationMutations,
  reconcileSettlementTransaction,
} from "./reconciliation.js";
import { atomicToDecimal } from "./settlement.js";

const updatePattern = /^1220[0-9a-f]{64}$/;
const attemptPattern = /^sha256:[0-9a-f]{64}$/;
const [updateId, attemptId] = process.argv.slice(2);
if (
  updateId === undefined ||
  !updatePattern.test(updateId) ||
  attemptId === undefined ||
  !attemptPattern.test(attemptId)
) {
  throw new Error("Usage: pnpm spike:reconcile <update-id> <attempt-id>");
}

const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const state = await client.loadSettlementState(config.payer.party);
const dsoParty = state.amuletRules.contract.payload.dso;
if (typeof dsoParty !== "string") {
  throw new Error("AmuletRules requires the DSO party");
}
const requestCommitment = commitHttpRequest({
  method: "GET",
  url: config.provider.resourceUrl,
}).commitment;
const proof = { attemptId, requestCommitment, updateId } as SettlementProof;
const expected = {
  amount: atomicToDecimal("2500000000"),
  dsoParty,
  payerParty: config.payer.party,
  providerParty: config.provider.party,
  synchronizerId: state.amuletRules.domain_id,
} as const;
const transaction = await client.getTransaction(
  proof.updateId,
  config.provider.party,
);
const mutations = evaluateReconciliationMutations(transaction, proof, expected);
if (!Object.values(mutations).every(Boolean)) {
  throw new Error("Live settlement mutation matrix failed");
}

const handler = createPaidResourceHandler({
  amount: "2500000000",
  dsoParty,
  maxTimeoutSeconds: 120,
  payerParty: config.payer.party,
  providerParty: config.provider.party,
  resourceUrl: config.provider.resourceUrl,
  synchronizerId: state.amuletRules.domain_id,
  verifySettlement: async (candidate) =>
    reconcileSettlementTransaction(
      await client.getTransaction(candidate.updateId, config.provider.party),
      candidate,
      expected,
    ),
});
const server = await startPaidProvider({
  handler,
  port: 0,
  resourceUrl: config.provider.resourceUrl,
});

try {
  const header = encodeSettlementProof(proof);
  const paidStatuses = await Promise.all(
    [header, header].map(
      async (value) =>
        (
          await fetch(server.localUrl, {
            headers: { "PAYMENT-SIGNATURE": value },
          })
        ).status,
    ),
  );
  const changedCommitment =
    `sha256:${proof.requestCommitment[7] === "0" ? "1" : "0"}${proof.requestCommitment.slice(8)}` as const;
  const mutationStatus = (
    await fetch(server.localUrl, {
      headers: {
        "PAYMENT-SIGNATURE": encodeSettlementProof({
          ...proof,
          requestCommitment: changedCommitment,
        }),
      },
    })
  ).status;
  if (paidStatuses.some((status) => status !== 200) || mutationStatus !== 402) {
    throw new Error("Live paid retry or proof mutation check failed");
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mutations,
        proofMutationHttpStatus: mutationStatus,
        retryHttpStatuses: paidStatuses,
        secondPaymentSubmitted: false,
        updateId: proof.updateId,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await server.close();
}
