export const proof = {
  attemptId: `sha256:${"a".repeat(64)}` as const,
  requestCommitment: `sha256:${"b".repeat(64)}` as const,
  updateId: `1220${"c".repeat(64)}`,
};

export const expected = {
  agentParty: `sotto-external-agent::1220${"d".repeat(64)}`,
  amuletTemplateId: `${"9".repeat(64)}:Splice.Amulet:Amulet`,
  amount: "0.2500000000",
  capabilityRevision: "0",
  challengeId: `sha256:${"5".repeat(64)}` as const,
  dsoParty: `DSO::1220${"e".repeat(64)}`,
  inputHoldingContractIds: ["00input"] as const,
  packageId: "f".repeat(64),
  payerParty: `sotto-external-payer::1220${"1".repeat(64)}`,
  providerParty: `sotto-provider::1220${"2".repeat(64)}`,
  purchaseCommitment: `sha256:${"6".repeat(64)}` as const,
  resourceHash: `sha256:${"3".repeat(64)}` as const,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
  transferContext: {
    externalPartyConfigState: "00external-config",
    featuredAppRight: "00featured-right",
  },
  transferPreapprovalContractId: "00preapproval",
  transferPreapprovalTemplateId: `${"8".repeat(64)}:Splice.AmuletRules:TransferPreapproval`,
};

export const holdingCid = "00provider-holding";

export function transaction() {
  return {
    transaction: {
      events: [
        {
          ExercisedEvent: {
            actingParties: [expected.payerParty],
            choice: "TransferPreapproval_SendV2",
            choiceArgument: {
              amount: expected.amount,
              context: { ...expected.transferContext },
              description: null,
              inputs: [
                {
                  tag: "InputAmulet",
                  value: expected.inputHoldingContractIds[0],
                },
              ],
              meta: { values: {} },
              sender: expected.payerParty,
            },
            consuming: false,
            contractId: expected.transferPreapprovalContractId,
            exerciseResult: {
              result: {
                createdAmulets: [
                  { tag: "TransferResultAmulet", value: holdingCid },
                ],
              },
            },
            templateId: expected.transferPreapprovalTemplateId,
          },
        },
        {
          CreatedEvent: {
            contractId: holdingCid,
            createArgument: {
              amount: {
                createdAt: { number: "5" },
                initialAmount: expected.amount,
                ratePerRound: { rate: "0.0001000000" },
              },
              dso: expected.dsoParty,
              owner: expected.providerParty,
            },
            templateId: expected.amuletTemplateId,
          },
        },
        {
          CreatedEvent: {
            contractId: "00context",
            createArgument: {
              agent: expected.agentParty,
              amount: expected.amount,
              attemptId: proof.attemptId,
              capabilityRevision: expected.capabilityRevision,
              challengeId: expected.challengeId,
              payer: expected.payerParty,
              provider: expected.providerParty,
              purchaseCommitment: expected.purchaseCommitment,
              requestCommitment: proof.requestCommitment,
              resourceHash: expected.resourceHash,
              totalDebit: expected.amount,
            },
            templateId: `${expected.packageId}:Sotto.Control.PurchaseCapability:PurchaseContext`,
          },
        },
      ],
      offset: 42,
      synchronizerId: expected.synchronizerId,
      updateId: proof.updateId,
    },
  };
}
