import { commitHttpRequest } from "@sotto/x402-canton";
import { createHash } from "node:crypto";
import { readSpikeConfig } from "./config.js";
import {
  activeContracts,
  buildActiveContractRequest,
  findCreatedContract,
} from "./daml-evidence.js";
import { sottoTemplateId } from "./daml-template-ids.js";
import { createFiveNorthClient } from "./five-north.js";

const updatePattern = /^1220[0-9a-f]{64}$/;
const attemptPattern = /^sha256:[0-9a-f]{64}$/;
const [paymentUpdateId, attemptId, createUpdateId, consumeUpdateId] =
  process.argv.slice(2);
if (
  [paymentUpdateId, createUpdateId, consumeUpdateId].some(
    (value) => value === undefined || !updatePattern.test(value),
  ) ||
  attemptId === undefined ||
  !attemptPattern.test(attemptId)
) {
  throw new Error(
    "Usage: pnpm spike:daml:reconcile <payment-update> <attempt> <create-update> <consume-update>",
  );
}

const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const createTransaction = await client.getTransaction(
  createUpdateId as string,
  config.payer.party,
);
const consumeTransaction = await client.getTransaction(
  consumeUpdateId as string,
  config.payer.party,
);
const originalPolicy = findCreatedContract(
  createTransaction,
  config.policy.packageId,
  "PurchasePolicyProbe",
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
const requestCommitment = commitHttpRequest({
  method: "GET",
  url: config.provider.resourceUrl,
}).commitment;
const resourceUrl = new URL(config.provider.resourceUrl);
const resourceHash = `sha256:${createHash("sha256")
  .update(`${resourceUrl.origin}${resourceUrl.pathname}`)
  .digest("hex")}`;
const usedAttempts = reducedPolicy.createArgument.usedAttemptIds;
if (
  originalPolicy.createArgument.allowedResourceHash !== resourceHash ||
  originalPolicy.createArgument.allowedRecipient !== config.provider.party ||
  reducedPolicy.createArgument.remainingLimit !== "0.7500000000" ||
  reducedPolicy.createArgument.revision !== "1" ||
  !Array.isArray(usedAttempts) ||
  !usedAttempts.includes(attemptId) ||
  context.createArgument.attemptId !== attemptId ||
  context.createArgument.requestCommitment !== requestCommitment ||
  context.createArgument.resourceHash !== resourceHash
) {
  throw new Error("Accepted Sotto Daml state does not match the paid attempt");
}

const policyTemplate = sottoTemplateId(
  config.policy.packageId,
  "PurchasePolicyProbe",
);
const contextTemplate = sottoTemplateId(
  config.policy.packageId,
  "PurchaseContextProbe",
);
const offset = await client.getLedgerEnd();
const readers = {
  agent: config.policy.agentParty,
  outsider: config.policy.outsiderParty,
  owner: config.policy.ownerParty,
  payer: config.payer.party,
  provider: config.provider.party,
} as const;
const visibility: Record<string, { context: number; policy: number }> = {};
for (const [role, party] of Object.entries(readers)) {
  const policy = activeContracts(
    await client.postLedger(
      "/v2/state/active-contracts",
      buildActiveContractRequest(party, policyTemplate, offset),
    ),
  );
  const contexts = activeContracts(
    await client.postLedger(
      "/v2/state/active-contracts",
      buildActiveContractRequest(party, contextTemplate, offset),
    ),
  );
  visibility[role] = { context: contexts.length, policy: policy.length };
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
      createUpdateId,
      consumeUpdateId,
      packageId: config.policy.packageId,
      paymentUpdateId,
      reducedPolicyContractId: reducedPolicy.contractId,
      visibility,
    },
    null,
    2,
  )}\n`,
);
