import type {
  Metadata_InputContract,
  Value,
} from "@canton-network/core-ledger-proto";
import type { BoundedPurchaseLedgerIntent } from "../src/index.js";
import {
  capabilityArgument,
  HISTORICAL_HOLDING_TEMPLATE_ID,
  INPUT_AMOUNT,
  PREPARED_PURCHASE_EFFECT_CIDS,
  selectedSplicePackage,
} from "./prepared-purchase-effect-values.fixtures.js";
import {
  EXTERNAL_PREAPPROVAL_THIRD_PARTY,
  externalHoldingArgument,
} from "./prepared-purchase-external-values.fixtures.js";
import {
  fixtureIdentifier,
  fixtureRecord,
} from "./prepared-purchase-value.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";

function inputContract(
  contractId: string,
  packageName: string,
  templateId: string,
  argument: Value,
  signatories: string[],
  stakeholders: string[],
  marker: number,
  eventBlob: Uint8Array,
): Metadata_InputContract {
  return {
    contract: {
      oneofKind: "v1",
      v1: {
        lfVersion: "2.1",
        contractId,
        packageName,
        templateId: fixtureIdentifier(templateId),
        argument,
        signatories,
        stakeholders,
      },
    },
    createdAt: BigInt(marker),
    eventBlob,
  };
}

export function buildEffectfulPreparedPurchaseInputs(
  intent: BoundedPurchaseLedgerIntent,
): Metadata_InputContract[] {
  const payer = intent.challenge.payerParty;
  const agent = intent.capability.agentParty;
  const admin = intent.tokenFactory.expectedAdmin;
  const splicePackage = selectedSplicePackage(intent);
  return [
    inputContract(
      intent.capability.contractId,
      "sotto-control",
      intent.capability.templateId,
      capabilityArgument(
        intent,
        "1.0000000000",
        intent.capability.expectedRevision,
      ),
      [payer],
      [payer, agent],
      1,
      new Uint8Array([1]),
    ),
    inputContract(
      intent.tokenFactory.contractId,
      "splice-amulet",
      intent.tokenFactory.creationTemplateId,
      fixtureRecord(intent.tokenFactory.creationTemplateId, []),
      [admin],
      [admin],
      2,
      new TextEncoder().encode("factory-disclosure"),
    ),
    inputContract(
      PREPARED_PURCHASE_EFFECT_CIDS.inputHolding,
      "splice-amulet",
      HISTORICAL_HOLDING_TEMPLATE_ID,
      externalHoldingArgument(
        HISTORICAL_HOLDING_TEMPLATE_ID,
        intent,
        payer,
        INPUT_AMOUNT,
      ),
      [admin, payer],
      [admin, payer],
      3,
      new TextEncoder().encode(
        `holding:${PREPARED_PURCHASE_EFFECT_CIDS.inputHolding}`,
      ),
    ),
    inputContract(
      EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      "splice-amulet",
      `${splicePackage}:Splice.AmuletRules:TransferPreapproval`,
      fixtureRecord(
        `${splicePackage}:Splice.AmuletRules:TransferPreapproval`,
        [],
      ),
      [
        admin,
        intent.challenge.recipientParty,
        EXTERNAL_PREAPPROVAL_THIRD_PARTY,
      ],
      [
        admin,
        intent.challenge.recipientParty,
        EXTERNAL_PREAPPROVAL_THIRD_PARTY,
      ],
      4,
      new TextEncoder().encode(
        `external:${EXTERNAL_PURCHASE_CONTEXT.transferPreapproval}`,
      ),
    ),
    inputContract(
      EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
      "splice-amulet",
      `${splicePackage}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
      fixtureRecord(
        `${splicePackage}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
        [],
      ),
      [admin],
      [admin],
      5,
      new TextEncoder().encode(
        `external:${EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState}`,
      ),
    ),
    inputContract(
      EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
      "splice-amulet",
      `${splicePackage}:Splice.AmuletRules:FeaturedAppRight`,
      fixtureRecord(`${splicePackage}:Splice.AmuletRules:FeaturedAppRight`, []),
      [EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      [EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      6,
      new TextEncoder().encode(
        `external:${EXTERNAL_PURCHASE_CONTEXT.featuredAppRight}`,
      ),
    ),
  ];
}
