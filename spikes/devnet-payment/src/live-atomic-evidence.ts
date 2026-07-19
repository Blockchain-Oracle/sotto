import type { createFiveNorthClient } from "./five-north.js";
import {
  activeContracts,
  buildActiveContractRequest,
} from "./daml-evidence.js";
import { sottoTemplateId } from "./daml-template-ids.js";

type Client = ReturnType<typeof createFiveNorthClient>;
type Readers = Readonly<Record<string, string>>;

async function queryContracts(
  client: Client,
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

export function buildRollbackRequest(
  purchase: object,
  attemptHash: string,
): Record<string, unknown> {
  const rollback = structuredClone(purchase) as Record<string, unknown>;
  rollback.commandId = `sotto-atomic-rollback-${attemptHash}`;
  const commands = rollback.commands as Array<Record<string, unknown>>;
  const consume = commands[0]?.ExerciseCommand as Record<string, unknown>;
  const choiceArgument = consume.choiceArgument as Record<string, unknown>;
  choiceArgument.amount = "0.3000000000";
  return rollback;
}

export async function policyIsActive(
  client: Client,
  packageId: string,
  party: string,
  policyCid: string,
  offset: number,
): Promise<boolean> {
  const policyTemplate = sottoTemplateId(packageId, "PurchasePolicyProbe");
  return (await queryContracts(client, party, policyTemplate, offset)).some(
    (contract) => contract.contractId === policyCid,
  );
}

export async function readAtomicVisibility(input: {
  attemptId: string;
  client: Client;
  offset: number;
  packageId: string;
  readers: Readers;
  reducedPolicyCid: string;
}) {
  const policyTemplate = sottoTemplateId(
    input.packageId,
    "PurchasePolicyProbe",
  );
  const contextTemplate = sottoTemplateId(
    input.packageId,
    "PurchaseContextProbe",
  );
  const visibility: Record<string, { context: number; policy: number }> = {};
  for (const [role, party] of Object.entries(input.readers)) {
    const policies = await queryContracts(
      input.client,
      party,
      policyTemplate,
      input.offset,
    );
    const contexts = await queryContracts(
      input.client,
      party,
      contextTemplate,
      input.offset,
    );
    visibility[role] = {
      context: contexts.filter(
        (contract) => contract.createArgument.attemptId === input.attemptId,
      ).length,
      policy: policies.filter(
        (contract) => contract.contractId === input.reducedPolicyCid,
      ).length,
    };
  }
  return visibility;
}
