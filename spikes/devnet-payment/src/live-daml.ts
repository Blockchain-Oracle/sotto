import { commitHttpRequest } from "@sotto/x402-canton";
import { createHash } from "node:crypto";
import { readSpikeConfig } from "./config.js";
import {
  buildConsumePolicyRequest,
  buildCreatePolicyRequest,
} from "./daml-commands.js";
import {
  activeContracts,
  buildActiveContractRequest,
  findCreatedContract,
} from "./daml-evidence.js";
import { sottoTemplateId } from "./daml-template-ids.js";
import { createFiveNorthClient } from "./five-north.js";
import { matchesLedgerRejection } from "./ledger-rejection.js";

const updatePattern = /^1220[0-9a-f]{64}$/;
const attemptPattern = /^sha256:[0-9a-f]{64}$/;
const [paymentUpdateId, attemptId] = process.argv.slice(2);
if (
  paymentUpdateId === undefined ||
  !updatePattern.test(paymentUpdateId) ||
  attemptId === undefined ||
  !attemptPattern.test(attemptId)
) {
  throw new Error("Usage: pnpm spike:daml <payment-update-id> <attempt-id>");
}

const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const userId = await client.getUserId();
const parties = {
  agent: config.policy.agentParty,
  owner: config.policy.ownerParty,
  payer: config.payer.party,
  provider: config.provider.party,
} as const;
const requestCommitment = commitHttpRequest({
  method: "GET",
  url: config.provider.resourceUrl,
}).commitment;
const resourceUrl = new URL(config.provider.resourceUrl);
const resourceHash = `sha256:${createHash("sha256")
  .update(`${resourceUrl.origin}${resourceUrl.pathname}`)
  .digest("hex")}` as const;
const attemptHash = attemptId.slice("sha256:".length);
const policyTemplate = sottoTemplateId(
  config.policy.packageId,
  "PurchasePolicyProbe",
);
const contextTemplate = sottoTemplateId(
  config.policy.packageId,
  "PurchaseContextProbe",
);

async function queryContracts(
  party: string,
  templateId: string,
  offset: number,
) {
  return activeContracts(
    await client.postLedger(
      "/v2/state/active-contracts",
      buildActiveContractRequest(party, templateId, offset),
    ),
  );
}

const beforeOffset = await client.getLedgerEnd();
const [priorPolicies, priorContexts] = await Promise.all([
  queryContracts(parties.payer, policyTemplate, beforeOffset),
  queryContracts(parties.payer, contextTemplate, beforeOffset),
]);
if (
  priorPolicies.some(
    ({ createArgument }) =>
      createArgument.allowedResourceHash === resourceHash &&
      createArgument.owner === parties.owner,
  ) ||
  priorContexts.some(
    ({ createArgument }) => createArgument.attemptId === attemptId,
  )
) {
  throw new Error(
    "Matching live policy state already exists; reconcile it first",
  );
}

const createResult = await client.submitSettlement(
  buildCreatePolicyRequest({
    commandId: `sotto-policy-create-${attemptHash}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    packageId: config.policy.packageId,
    parties,
    resourceHash,
    userId,
  }),
);
const createTransaction = await client.getTransaction(
  createResult.updateId,
  parties.payer,
);
const originalPolicy = findCreatedContract(
  createTransaction,
  config.policy.packageId,
  "PurchasePolicyProbe",
);
const consumeResult = await client.submitSettlement(
  buildConsumePolicyRequest({
    amount: "0.2500000000",
    attemptId: attemptId as `sha256:${string}`,
    commandId: `sotto-policy-consume-${attemptHash}`,
    packageId: config.policy.packageId,
    parties,
    policyCid: originalPolicy.contractId,
    requestCommitment,
    resourceHash,
    userId,
  }),
);
const consumeTransaction = await client.getTransaction(
  consumeResult.updateId,
  parties.payer,
);
const reducedPolicy = findCreatedContract(
  consumeTransaction,
  config.policy.packageId,
  "PurchasePolicyProbe",
);
const context = findCreatedContract(
  consumeTransaction,
  config.policy.packageId,
  "PurchaseContextProbe",
);

async function requireRejected(
  commandId: string,
  policyCid: string,
  id: string,
  amount: string,
  expected: Readonly<{ reason: string; status: number }>,
) {
  try {
    await client.submitSettlement(
      buildConsumePolicyRequest({
        amount,
        attemptId: id as `sha256:${string}`,
        commandId,
        packageId: config.policy.packageId,
        parties,
        policyCid,
        requestCommitment,
        resourceHash,
        userId,
      }),
    );
  } catch (error) {
    if (matchesLedgerRejection(error, expected)) return;
    throw error;
  }
  throw new Error(`${commandId} was unexpectedly accepted`);
}

await requireRejected(
  `sotto-policy-over-limit-${attemptHash}`,
  reducedPolicy.contractId,
  `sha256:${"d".repeat(64)}`,
  "0.3000000000",
  { reason: "amount exceeds per-call limit", status: 400 },
);
await requireRejected(
  `sotto-policy-duplicate-${attemptHash}`,
  reducedPolicy.contractId,
  attemptId,
  "0.1000000000",
  { reason: "attempt was already consumed", status: 400 },
);
await requireRejected(
  `sotto-policy-stale-${attemptHash}`,
  originalPolicy.contractId,
  `sha256:${"e".repeat(64)}`,
  "0.1000000000",
  { reason: "CONTRACT_NOT_FOUND", status: 404 },
);

const evidenceOffset = await client.getLedgerEnd();
const readers = {
  agent: parties.agent,
  outsider: config.policy.outsiderParty,
  owner: parties.owner,
  payer: parties.payer,
  provider: parties.provider,
} as const;
const visibility: Record<string, { context: number; policy: number }> = {};
for (const [role, party] of Object.entries(readers)) {
  const policy = await queryContracts(party, policyTemplate, evidenceOffset);
  const contextContracts = await queryContracts(
    party,
    contextTemplate,
    evidenceOffset,
  );
  visibility[role] = {
    context: contextContracts.length,
    policy: policy.length,
  };
}
const expectedVisibility = {
  agent: { context: 1, policy: 1 },
  outsider: { context: 0, policy: 0 },
  owner: { context: 1, policy: 1 },
  payer: { context: 1, policy: 1 },
  provider: { context: 1, policy: 0 },
};
if (JSON.stringify(visibility) !== JSON.stringify(expectedVisibility)) {
  throw new Error(
    "Live Daml visibility matrix did not match the authority design",
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      atomicWithPayment: false,
      contextContractId: context.contractId,
      createUpdateId: createResult.updateId,
      consumeUpdateId: consumeResult.updateId,
      packageId: config.policy.packageId,
      paymentUpdateId,
      reducedPolicyContractId: reducedPolicy.contractId,
      rejected: ["over-limit", "duplicate", "stale-cid"],
      visibility,
    },
    null,
    2,
  )}\n`,
);
