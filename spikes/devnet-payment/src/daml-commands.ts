import { sottoTemplateId } from "./daml-template-ids.js";

type PolicyParties = Readonly<{
  agent: string;
  owner: string;
  payer: string;
  provider: string;
}>;

type CreatePolicyInput = Readonly<{
  commandId: string;
  expiresAt: string;
  packageId: string;
  parties: PolicyParties;
  resourceHash: `sha256:${string}`;
  userId: string;
}>;

type ConsumePolicyInput = Readonly<{
  amount: string;
  attemptId: `sha256:${string}`;
  commandId: string;
  packageId: string;
  parties: PolicyParties;
  policyCid: string;
  requestCommitment: `sha256:${string}`;
  resourceHash: `sha256:${string}`;
  userId: string;
}>;

export function buildCreatePolicyRequest(input: CreatePolicyInput) {
  const { parties } = input;
  const policyTemplate = sottoTemplateId(
    input.packageId,
    "PurchasePolicyProbe",
  );
  return {
    actAs: [parties.payer],
    readAs: [],
    userId: input.userId,
    commandId: input.commandId,
    workflowId: "sotto-policy-probe-v1",
    commands: [
      {
        CreateCommand: {
          templateId: policyTemplate,
          createArguments: {
            owner: parties.owner,
            agent: parties.agent,
            payer: parties.payer,
            allowedResourceHash: input.resourceHash,
            allowedRecipient: parties.provider,
            perCallLimit: "0.2500000000",
            remainingLimit: "1.0000000000",
            expiresAt: input.expiresAt,
            revision: "0",
            paused: false,
            usedAttemptIds: [],
          },
        },
      },
    ],
  } as const;
}

export function buildConsumePolicyRequest(input: ConsumePolicyInput) {
  const { parties } = input;
  const policyTemplate = sottoTemplateId(
    input.packageId,
    "PurchasePolicyProbe",
  );
  return {
    actAs: [parties.agent, parties.payer],
    readAs: [parties.owner],
    userId: input.userId,
    commandId: input.commandId,
    workflowId: "sotto-policy-probe-v1",
    commands: [
      {
        ExerciseCommand: {
          templateId: policyTemplate,
          contractId: input.policyCid,
          choice: "Consume",
          choiceArgument: {
            attemptId: input.attemptId,
            requestCommitment: input.requestCommitment,
            resourceHash: input.resourceHash,
            recipient: parties.provider,
            amount: input.amount,
          },
        },
      },
    ],
  } as const;
}
