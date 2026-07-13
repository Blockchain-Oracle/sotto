import type { PaymentAuthorization } from "@sotto/x402-canton";
import { createHash } from "node:crypto";
import { buildConsumePolicyRequest } from "./daml-commands.js";
import { atomicToDecimal, buildSettlementRequest } from "./settlement.js";

type Parties = Readonly<{
  agent: string;
  owner: string;
  payer: string;
  provider: string;
}>;

type SettlementInput = Parameters<typeof buildSettlementRequest>[0];

type AtomicPurchaseInput = Omit<SettlementInput, "providerParty"> &
  Readonly<{
    parties: Parties;
    policyCid: string;
    policyPackageId: string;
    resourceHash: `sha256:${string}`;
  }>;

export function atomicPurchaseCommandId(
  proof: Pick<PaymentAuthorization, "attemptId" | "requestCommitment">,
): string {
  const commitment = createHash("sha256")
    .update(
      JSON.stringify({
        version: "sotto-atomic-purchase-command-v1",
        attemptId: proof.attemptId,
        requestCommitment: proof.requestCommitment,
      }),
    )
    .digest("hex");
  return `sotto-purchase-${commitment}`;
}

export function buildAtomicPurchaseRequest(input: AtomicPurchaseInput) {
  const { authorization, parties } = input;
  if (
    parties.payer !== authorization.payerParty ||
    parties.provider !== authorization.requirement.payTo
  ) {
    throw new Error("Atomic purchase parties do not match the authorization");
  }
  const settlement = buildSettlementRequest({
    amuletRules: input.amuletRules,
    authorization,
    now: input.now,
    openMiningRounds: input.openMiningRounds,
    payerHolding: input.payerHolding,
    providerParty: parties.provider,
    userId: input.userId,
  });
  const consume = buildConsumePolicyRequest({
    amount: atomicToDecimal(authorization.requirement.amount),
    attemptId: authorization.attemptId,
    commandId: atomicPurchaseCommandId(authorization),
    packageId: input.policyPackageId,
    parties,
    policyCid: input.policyCid,
    requestCommitment: authorization.requestCommitment,
    resourceHash: input.resourceHash,
    userId: input.userId,
  });
  return {
    ...settlement,
    actAs: [parties.agent, parties.payer, parties.provider],
    readAs: [parties.owner, parties.payer, parties.provider],
    commandId: atomicPurchaseCommandId(authorization),
    workflowId: "sotto-atomic-purchase-v1",
    commands: [...consume.commands, ...settlement.commands],
  } as const;
}
