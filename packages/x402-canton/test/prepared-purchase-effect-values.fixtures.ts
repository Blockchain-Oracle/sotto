import type { Value } from "@canton-network/core-ledger-proto";
import type {
  BoundedPurchaseLedgerIntent,
  BoundedPurchasePrepareRequest,
} from "../src/index.js";
import {
  fixtureContractIds,
  fixtureExtraArgs,
  fixtureIdentifier,
  fixtureInstrument,
  fixtureMetadata,
  fixtureRecord,
  fixtureScalar,
  fixtureTimestamp,
} from "./prepared-purchase-value.fixtures.js";

export const HOLDING_INTERFACE_ID =
  "718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b:Splice.Api.Token.HoldingV1:Holding";
export const HISTORICAL_HOLDING_TEMPLATE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.Amulet:Amulet";
export const ARCHIVE_RECORD_ID =
  "9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69:DA.Internal.Template:Archive";
export const INPUT_AMOUNT = "0.3250000000";
export const PRINCIPAL = "0.2500000000";
export const CHANGE = "0.0500000000";
export const TOTAL_DEBIT = "0.2750000000";
export const REPLACEMENT_ALLOWANCE = "0.7250000000";

export const PREPARED_PURCHASE_EFFECT_CIDS = Object.freeze({
  inputHolding: "00holding-a",
  receiverHolding: "00effect-receiver-holding",
  senderChangeHolding: "00effect-change-holding",
  context: "00effect-purchase-context",
  replacementCapability: "00effect-replacement-capability",
});

export function selectedSplicePackage(
  intent: BoundedPurchaseLedgerIntent,
): string {
  const packageId = intent.packageSelection.references.find(
    ({ packageName }) => packageName === "splice-amulet",
  )?.packageId;
  if (packageId === undefined) {
    throw new Error("selected splice package is absent");
  }
  return packageId;
}

export function rootChoice(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): Value {
  const argument = request.commands[0]!.ExerciseCommand.choiceArgument;
  if (
    argument.amount !== PRINCIPAL ||
    argument.inputHoldingCids.join() !==
      PREPARED_PURCHASE_EFFECT_CIDS.inputHolding
  ) {
    throw new Error("effect fixture requires its exact accounting vector");
  }
  const packageId = fixtureIdentifier(intent.capability.templateId).packageId;
  return fixtureRecord(
    `${packageId}:Sotto.Control.PurchaseCapability:Purchase`,
    [
      ["attemptId", fixtureScalar("text", argument.attemptId)],
      [
        "purchaseCommitment",
        fixtureScalar("text", argument.purchaseCommitment),
      ],
      ["requestCommitment", fixtureScalar("text", argument.requestCommitment)],
      ["challengeId", fixtureScalar("text", argument.challengeId)],
      ["resourceHash", fixtureScalar("text", argument.resourceHash)],
      ["recipient", fixtureScalar("party", argument.recipient)],
      ["amount", fixtureScalar("numeric", argument.amount)],
      ["requestedAt", fixtureTimestamp(argument.requestedAt)],
      ["executeBefore", fixtureTimestamp(argument.executeBefore)],
      ["inputHoldingCids", fixtureContractIds(argument.inputHoldingCids)],
      ["extraArgs", fixtureExtraArgs(request)],
      ["expectedRevision", fixtureScalar("int64", argument.expectedRevision)],
    ],
  );
}

export function factoryChoice(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): Value {
  const argument = request.commands[0]!.ExerciseCommand.choiceArgument;
  const packageId = fixtureIdentifier(
    intent.tokenFactory.interfaceId,
  ).packageId;
  return fixtureRecord(
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferFactory_Transfer`,
    [
      [
        "expectedAdmin",
        fixtureScalar("party", intent.tokenFactory.expectedAdmin),
      ],
      [
        "transfer",
        fixtureRecord(
          `${packageId}:Splice.Api.Token.TransferInstructionV1:Transfer`,
          [
            ["sender", fixtureScalar("party", intent.challenge.payerParty)],
            [
              "receiver",
              fixtureScalar("party", intent.challenge.recipientParty),
            ],
            ["amount", fixtureScalar("numeric", PRINCIPAL)],
            ["instrumentId", fixtureInstrument(intent, HOLDING_INTERFACE_ID)],
            ["requestedAt", fixtureTimestamp(intent.challenge.requestedAt)],
            ["executeBefore", fixtureTimestamp(intent.challenge.executeBefore)],
            ["inputHoldingCids", fixtureContractIds(argument.inputHoldingCids)],
            ["meta", fixtureMetadata()],
          ],
        ),
      ],
      ["extraArgs", fixtureExtraArgs(request)],
    ],
  );
}

export function factoryResult(intent: BoundedPurchaseLedgerIntent): Value {
  const packageId = fixtureIdentifier(
    intent.tokenFactory.interfaceId,
  ).packageId;
  return fixtureRecord(
    `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult`,
    [
      [
        "output",
        {
          sum: {
            oneofKind: "variant",
            variant: {
              variantId: fixtureIdentifier(
                `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult_Output`,
              ),
              constructor: "TransferInstructionResult_Completed",
              value: fixtureRecord(
                `${packageId}:Splice.Api.Token.TransferInstructionV1:TransferInstructionResult_Output.TransferInstructionResult_Completed`,
                [
                  [
                    "receiverHoldingCids",
                    fixtureContractIds([
                      PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding,
                    ]),
                  ],
                ],
              ),
            },
          },
        },
      ],
      [
        "senderChangeCids",
        fixtureContractIds([PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding]),
      ],
      ["meta", fixtureMetadata({ "splice.example/fee": "0.025" })],
    ],
  );
}

export function rootResult(intent: BoundedPurchaseLedgerIntent): Value {
  const packageId = fixtureIdentifier(intent.capability.templateId).packageId;
  return fixtureRecord(
    `${packageId}:Sotto.Control.PurchaseCapability:PurchaseResult`,
    [
      [
        "capabilityCid",
        fixtureScalar(
          "contractId",
          PREPARED_PURCHASE_EFFECT_CIDS.replacementCapability,
        ),
      ],
      [
        "contextCid",
        fixtureScalar("contractId", PREPARED_PURCHASE_EFFECT_CIDS.context),
      ],
      [
        "receiverHoldingCids",
        fixtureContractIds([PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding]),
      ],
      ["totalDebit", fixtureScalar("numeric", TOTAL_DEBIT)],
    ],
  );
}

export function holdingArgument(
  templateId: string,
  intent: BoundedPurchaseLedgerIntent,
  owner: string,
  amount: string,
): Value {
  return fixtureRecord(templateId, [
    ["owner", fixtureScalar("party", owner)],
    ["instrumentId", fixtureInstrument(intent, HOLDING_INTERFACE_ID)],
    ["amount", fixtureScalar("numeric", amount)],
  ]);
}

export function capabilityArgument(
  intent: BoundedPurchaseLedgerIntent,
  allowance: string,
  revision: string,
): Value {
  return fixtureRecord(intent.capability.templateId, [
    ["payer", fixtureScalar("party", intent.challenge.payerParty)],
    ["agent", fixtureScalar("party", intent.capability.agentParty)],
    [
      "resourceBindingVersion",
      fixtureScalar("text", intent.capability.resourceBindingVersion),
    ],
    [
      "allowedResourceHash",
      fixtureScalar("text", intent.capability.resourceHash),
    ],
    [
      "allowedRecipient",
      fixtureScalar("party", intent.capability.recipientParty),
    ],
    ["instrumentId", fixtureInstrument(intent, HOLDING_INTERFACE_ID)],
    ["perCallLimit", fixtureScalar("numeric", "0.3000000000")],
    ["remainingAllowance", fixtureScalar("numeric", allowance)],
    ["maximumTotalDebit", fixtureScalar("numeric", INPUT_AMOUNT)],
    ["expiresAt", fixtureTimestamp(intent.capability.expiresAt)],
    ["revision", fixtureScalar("int64", revision)],
    ["paused", fixtureScalar("bool", false)],
    [
      "transferFactoryCid",
      fixtureScalar("contractId", intent.tokenFactory.contractId),
    ],
    [
      "expectedAdmin",
      fixtureScalar("party", intent.tokenFactory.expectedAdmin),
    ],
  ]);
}

export function contextArgument(intent: BoundedPurchaseLedgerIntent): Value {
  const packageId = fixtureIdentifier(intent.capability.templateId).packageId;
  return fixtureRecord(
    `${packageId}:Sotto.Control.PurchaseCapability:PurchaseContext`,
    [
      ["payer", fixtureScalar("party", intent.challenge.payerParty)],
      ["agent", fixtureScalar("party", intent.capability.agentParty)],
      ["provider", fixtureScalar("party", intent.challenge.recipientParty)],
      ["attemptId", fixtureScalar("text", intent.attemptId)],
      ["purchaseCommitment", fixtureScalar("text", intent.purchaseCommitment)],
      [
        "requestCommitment",
        fixtureScalar("text", intent.request.requestCommitment),
      ],
      ["challengeId", fixtureScalar("text", intent.challenge.challengeId)],
      ["resourceHash", fixtureScalar("text", intent.capability.resourceHash)],
      [
        "capabilityRevision",
        fixtureScalar("int64", intent.capability.expectedRevision),
      ],
      ["amount", fixtureScalar("numeric", PRINCIPAL)],
      ["totalDebit", fixtureScalar("numeric", TOTAL_DEBIT)],
    ],
  );
}
