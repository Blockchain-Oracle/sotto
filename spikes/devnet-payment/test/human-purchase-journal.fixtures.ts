import { createHash } from "node:crypto";
import {
  HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA,
  type PersistedHumanSettlementExpectation,
} from "@sotto/x402-canton/internal/human-settlement-expectation-journal";

export const humanJournalSha = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

export function persistedHumanJournalExpectation(): PersistedHumanSettlementExpectation {
  const packageId = "f".repeat(64);
  const purchaseCommitment = `sha256:${"4".repeat(64)}` as const;
  const expectation = {
    version: "sotto-human-settlement-expectation-v1" as const,
    commandId: `sotto-human-purchase-v1-${purchaseCommitment.slice(7)}`,
    attemptId: `sha256:${"1".repeat(64)}` as const,
    challengeId: `sha256:${"2".repeat(64)}` as const,
    requestCommitment: `sha256:${"3".repeat(64)}` as const,
    purchaseCommitment,
    payerParty: `external-payer::1220${"5".repeat(64)}`,
    providerParty: `sotto-provider::1220${"6".repeat(64)}`,
    amount: "0.2500000000",
    dsoParty: `DSO::1220${"7".repeat(64)}`,
    synchronizerId: `global-domain::1220${"8".repeat(64)}`,
    packageId,
    transferFactoryContractId: "00transfer-factory",
    inputHoldingContractIds: ["00input-holding"],
    transferPreapprovalContractId: "00transfer-preapproval",
    choiceContextContractIds: {
      "external-party-config-state": "00external-party-config",
      "featured-app-right": "00featured-app-right",
      "transfer-preapproval": "00transfer-preapproval",
    },
    amuletTemplateId: `${packageId}:Splice.Amulet:Amulet`,
    transferPreapprovalTemplateId: `${packageId}:Splice.AmuletRules:TransferPreapproval`,
  };
  return {
    schema: HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA,
    expectation,
    authorityDigest: humanJournalSha(
      JSON.stringify({
        schema: HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA,
        expectation,
      }),
    ),
  };
}

export const HUMAN_JOURNAL_SESSION = `sha256:${"9".repeat(64)}` as const;
export const HUMAN_JOURNAL_PREPARED_HASH = `sha256:${"a".repeat(64)}` as const;
export const HUMAN_JOURNAL_UPDATE_ID = `1220${"c".repeat(64)}`;
