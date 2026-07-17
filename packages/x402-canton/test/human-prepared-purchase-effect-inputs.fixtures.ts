import type {
  Metadata_InputContract,
  Value,
} from "@canton-network/core-ledger-proto";
import type {
  HumanPurchaseLedgerIntent,
  HumanPurchasePrepareRequest,
} from "../src/index.js";
import { HISTORICAL_HOLDING_TEMPLATE_ID } from "./prepared-purchase-effect-values.fixtures.js";
import {
  EXTERNAL_PREAPPROVAL_THIRD_PARTY,
  externalHoldingArgument,
} from "./prepared-purchase-external-values.fixtures.js";
import {
  fixtureIdentifier,
  fixtureRecord,
  fixtureScalar,
  fixtureTimestamp,
} from "./prepared-purchase-value.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import { humanPreparedInputVector } from "./human-prepared-purchase-input-vector.fixtures.js";

function optional(value?: Value): Value {
  return {
    sum: {
      oneofKind: "optional",
      optional: value === undefined ? {} : { value },
    },
  };
}

function trafficBasedRewards(packageId: string): Value {
  return optional({
    sum: {
      oneofKind: "enum",
      enum: {
        enumId: fixtureIdentifier(
          `${packageId}:Splice.AmuletConfig:RewardVersion`,
        ),
        constructor: "RewardVersion_TrafficBasedAppRewards",
      },
    },
  });
}

function externalConfigArgument(
  intent: HumanPurchaseLedgerIntent,
  packageId: string,
): Value {
  const archiveAfter = new Date(
    Date.parse(intent.challenge.executeBefore) + 60_000,
  ).toISOString();
  return fixtureRecord(
    `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
    [
      ["dso", fixtureScalar("party", intent.tokenFactory.expectedAdmin)],
      [
        "holdingFeesOpenRoundNumber",
        fixtureRecord(`${packageId}:Splice.Types:Round`, [
          ["number", fixtureScalar("int64", "1")],
        ]),
      ],
      ["amuletPrice", fixtureScalar("numeric", "1.0000000000")],
      [
        "transferConfig",
        fixtureRecord(`${packageId}:Splice.AmuletConfig:TransferConfigV2`, [
          [
            "holdingFee",
            fixtureRecord(`${packageId}:Splice.Fees:RatePerRound`, [
              ["rate", fixtureScalar("numeric", "0.0001000000")],
            ]),
          ],
          ["maxNumInputs", fixtureScalar("int64", "16")],
          ["maxNumOutputs", fixtureScalar("int64", "16")],
          ["maxNumLockHolders", fixtureScalar("int64", "16")],
          ["tokenStandardMaxTTL", optional()],
        ]),
      ],
      ["targetArchiveAfter", fixtureTimestamp(archiveAfter)],
      ["rewardCalculationVersion", trafficBasedRewards(packageId)],
    ],
  );
}

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

export function humanPreparedPurchaseInputs(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): Metadata_InputContract[] {
  const payer = intent.challenge.payerParty;
  const provider = intent.challenge.recipientParty;
  const admin = intent.tokenFactory.expectedAdmin;
  const packageId = intent.packageSelection.packageIds[0];
  const external = (
    contractId: string,
    templateId: string,
    argument: Value,
    signatories: string[],
    stakeholders: string[],
    marker: number,
  ) =>
    inputContract(
      contractId,
      "splice-amulet",
      templateId,
      argument,
      signatories,
      stakeholders,
      marker,
      new TextEncoder().encode(`external:${contractId}`),
    );
  return [
    inputContract(
      intent.tokenFactory.contractId,
      "splice-amulet",
      intent.tokenFactory.creationTemplateId,
      fixtureRecord(intent.tokenFactory.creationTemplateId, [
        ["dso", fixtureScalar("party", admin)],
      ]),
      [admin],
      [admin],
      1,
      new TextEncoder().encode("factory-disclosure"),
    ),
    ...humanPreparedInputVector(request).map(({ amount, contractId }, index) =>
      inputContract(
        contractId,
        "splice-amulet",
        HISTORICAL_HOLDING_TEMPLATE_ID,
        externalHoldingArgument(
          HISTORICAL_HOLDING_TEMPLATE_ID,
          intent as never,
          payer,
          amount,
        ),
        [admin, payer],
        [admin, payer],
        2 + index,
        new TextEncoder().encode(`holding:${contractId}`),
      ),
    ),
    external(
      EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      `${packageId}:Splice.AmuletRules:TransferPreapproval`,
      fixtureRecord(`${packageId}:Splice.AmuletRules:TransferPreapproval`, [
        ["dso", fixtureScalar("party", admin)],
        ["receiver", fixtureScalar("party", provider)],
        ["provider", fixtureScalar("party", EXTERNAL_PREAPPROVAL_THIRD_PARTY)],
        ["validFrom", fixtureTimestamp(intent.challenge.requestedAt)],
        ["lastRenewedAt", fixtureTimestamp(intent.challenge.requestedAt)],
        ["expiresAt", fixtureTimestamp(intent.challenge.executeBefore)],
      ]),
      [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      [admin, provider, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      20,
    ),
    external(
      EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
      `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
      externalConfigArgument(intent, packageId),
      [admin],
      [admin],
      21,
    ),
    external(
      EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
      `${packageId}:Splice.Amulet:FeaturedAppRight`,
      fixtureRecord(`${packageId}:Splice.Amulet:FeaturedAppRight`, [
        ["dso", fixtureScalar("party", admin)],
        ["provider", fixtureScalar("party", EXTERNAL_PREAPPROVAL_THIRD_PARTY)],
      ]),
      [admin],
      [admin, EXTERNAL_PREAPPROVAL_THIRD_PARTY],
      22,
    ),
  ];
}
