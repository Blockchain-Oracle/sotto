import type { Value } from "@canton-network/core-ledger-proto";
import type {
  HumanPurchaseLedgerIntent,
  HumanPurchasePrepareRequest,
} from "../src/index.js";
import {
  INPUT_AMOUNT,
  PREPARED_PURCHASE_EFFECT_CIDS,
  PRINCIPAL,
} from "./prepared-purchase-effect-values.fixtures.js";
import {
  fixtureIdentifier,
  fixtureMetadata,
  fixtureRecord,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";
import { humanResultMetadata } from "./human-prepared-purchase-token-metadata.fixtures.js";

const ZERO = "0.0000000000";
const RATE = "0.0001000000";
const PROVIDER_ROUND_ZERO = "0.2501000000";

export const HUMAN_CHANGE = "0.0750000000";
export const HUMAN_TRANSFER_ROUND = "1";

function optional(value?: Value): Value {
  return {
    sum: {
      oneofKind: "optional",
      optional: value === undefined ? {} : { value },
    },
  };
}

function numericList(values: readonly string[]): Value {
  return {
    sum: {
      oneofKind: "list",
      list: {
        elements: values.map((value) => fixtureScalar("numeric", value)),
      },
    },
  };
}

function balanceChange(
  packageId: string,
  initialAmount: string,
  rate: string,
): Value {
  return fixtureRecord(`${packageId}:Splice.AmuletRules:BalanceChange`, [
    [
      "changeToInitialAmountAsOfRoundZero",
      fixtureScalar("numeric", initialAmount),
    ],
    ["changeToHoldingFeesRate", fixtureScalar("numeric", rate)],
  ]);
}

function balanceChanges(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  packageId: string,
): Value {
  const inputCount =
    request.commands[0].ExerciseCommand.choiceArgument.transfer.inputHoldingCids
      .length;
  const payerRoundZero = inputCount === 1 ? "-0.2500000000" : "-0.2501000000";
  const payerRate = inputCount === 1 ? ZERO : "-0.0001000000";
  return {
    sum: {
      oneofKind: "genMap",
      genMap: {
        entries: [
          {
            key: fixtureScalar("party", intent.challenge.payerParty),
            value: balanceChange(packageId, payerRoundZero, payerRate),
          },
          {
            key: fixtureScalar("party", intent.challenge.recipientParty),
            value: balanceChange(packageId, PROVIDER_ROUND_ZERO, RATE),
          },
        ],
      },
    },
  };
}

function transferSummary(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  packageId: string,
): Value {
  return fixtureRecord(`${packageId}:Splice.AmuletRules:TransferSummary`, [
    ["inputAppRewardAmount", fixtureScalar("numeric", ZERO)],
    ["inputValidatorRewardAmount", fixtureScalar("numeric", ZERO)],
    ["inputSvRewardAmount", fixtureScalar("numeric", ZERO)],
    ["inputAmuletAmount", fixtureScalar("numeric", INPUT_AMOUNT)],
    ["balanceChanges", balanceChanges(intent, request, packageId)],
    ["holdingFees", fixtureScalar("numeric", ZERO)],
    ["outputFees", numericList([ZERO])],
    ["senderChangeFee", fixtureScalar("numeric", ZERO)],
    ["senderChangeAmount", fixtureScalar("numeric", HUMAN_CHANGE)],
    ["amuletPrice", fixtureScalar("numeric", "1.0000000000")],
    ["inputValidatorFaucetAmount", optional(fixtureScalar("numeric", ZERO))],
    [
      "inputUnclaimedActivityRecordAmount",
      optional(fixtureScalar("numeric", ZERO)),
    ],
    ["inputDevelopmentFundAmount", optional(fixtureScalar("numeric", ZERO))],
  ]);
}

function createdAmulet(packageId: string): Value {
  return {
    sum: {
      oneofKind: "variant",
      variant: {
        variantId: fixtureIdentifier(
          `${packageId}:Splice.AmuletRules:CreatedAmulet`,
        ),
        constructor: "TransferResultAmulet",
        value: fixtureScalar(
          "contractId",
          PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding,
        ),
      },
    },
  };
}

export function humanPreapprovalResult(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): Value {
  const packageId = intent.packageSelection.packageIds[0];
  const transfer = fixtureRecord(
    `${packageId}:Splice.AmuletRules:TransferResult`,
    [
      [
        "round",
        fixtureRecord(`${packageId}:Splice.Types:Round`, [
          ["number", fixtureScalar("int64", HUMAN_TRANSFER_ROUND)],
        ]),
      ],
      ["summary", transferSummary(intent, request, packageId)],
      [
        "createdAmulets",
        {
          sum: {
            oneofKind: "list",
            list: { elements: [createdAmulet(packageId)] },
          },
        },
      ],
      [
        "senderChangeAmulet",
        optional(
          fixtureScalar(
            "contractId",
            PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding,
          ),
        ),
      ],
      ["meta", optional()],
    ],
  );
  return fixtureRecord(
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2Result`,
    [
      ["result", transfer],
      ["meta", fixtureMetadata(humanResultMetadata(intent, request))],
    ],
  );
}

export { INPUT_AMOUNT, PRINCIPAL };
