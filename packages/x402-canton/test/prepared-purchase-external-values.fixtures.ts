import type { Value } from "@canton-network/core-ledger-proto";
import type {
  BoundedPurchaseLedgerIntent,
  BoundedPurchasePrepareRequest,
} from "../src/index.js";
import {
  HOLDING_V2_PACKAGE_ID,
  TRANSFER_EVENT_PACKAGE_ID,
} from "../src/prepared-purchase-event-log-values.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import {
  fixtureContractIds,
  fixtureIdentifier,
  fixtureMetadata,
  fixtureRecord,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";
import {
  PREPARED_PURCHASE_EFFECT_CIDS,
  PRINCIPAL,
  selectedSplicePackage,
} from "./prepared-purchase-effect-values.fixtures.js";

export const EXTERNAL_PREAPPROVAL_THIRD_PARTY =
  "five-north-validator::1220validator";

export function externalHoldingArgument(
  templateId: string,
  intent: BoundedPurchaseLedgerIntent,
  owner: string,
  amount: string,
): Value {
  const packageId = fixtureIdentifier(templateId).packageId;
  return fixtureRecord(templateId, [
    ["dso", fixtureScalar("party", intent.tokenFactory.expectedAdmin)],
    ["owner", fixtureScalar("party", owner)],
    [
      "amount",
      fixtureRecord(`${packageId}:Splice.Fees:ExpiringAmount`, [
        ["initialAmount", fixtureScalar("numeric", amount)],
        [
          "createdAt",
          fixtureRecord(`${packageId}:Splice.Types:Round`, [
            ["number", fixtureScalar("int64", "1")],
          ]),
        ],
        [
          "ratePerRound",
          fixtureRecord(`${packageId}:Splice.Fees:RatePerRound`, [
            ["rate", fixtureScalar("numeric", "0.0001000000")],
          ]),
        ],
      ]),
    ],
  ]);
}

function fixtureOptional(value?: Value): Value {
  return {
    sum: {
      oneofKind: "optional",
      optional: value === undefined ? {} : { value },
    },
  };
}

function fixtureList(elements: Value[]): Value {
  return { sum: { oneofKind: "list", list: { elements } } };
}

function fixtureVariant(
  variantId: string,
  constructor: string,
  value: Value,
): Value {
  return {
    sum: {
      oneofKind: "variant",
      variant: {
        variantId: fixtureIdentifier(variantId),
        constructor,
        value,
      },
    },
  };
}

function account(owner: string): Value {
  return fixtureRecord(
    `${HOLDING_V2_PACKAGE_ID}:Splice.Api.Token.HoldingV2:Account`,
    [
      ["owner", fixtureOptional(fixtureScalar("party", owner))],
      ["provider", fixtureOptional()],
      ["id", fixtureScalar("text", "")],
    ],
  );
}

function eventExtraArgs(): Value {
  const metadataPackage =
    "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f";
  return fixtureRecord(
    `${metadataPackage}:Splice.Api.Token.MetadataV1:ExtraArgs`,
    [
      [
        "context",
        fixtureRecord(
          `${metadataPackage}:Splice.Api.Token.MetadataV1:ChoiceContext`,
          [
            [
              "values",
              { sum: { oneofKind: "textMap", textMap: { entries: [] } } },
            ],
          ],
        ),
      ],
      ["meta", fixtureMetadata()],
    ],
  );
}

function transferLeg(
  intent: BoundedPurchaseLedgerIntent,
  otherSide: string,
  side: "SenderSide" | "ReceiverSide",
): Value {
  return fixtureRecord(
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:TransferLegSide`,
    [
      ["transferLegId", fixtureScalar("text", "leg0")],
      [
        "side",
        {
          sum: {
            oneofKind: "enum",
            enum: {
              enumId: fixtureIdentifier(
                `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:TransferSide`,
              ),
              constructor: side,
            },
          },
        },
      ],
      ["otherside", account(otherSide)],
      ["amount", fixtureScalar("numeric", PRINCIPAL)],
      ["instrumentId", fixtureScalar("text", intent.challenge.instrument.id)],
      ["meta", fixtureMetadata()],
    ],
  );
}

export function externalEventChoice(
  intent: BoundedPurchaseLedgerIntent,
  owner: string,
): Value {
  const sender = owner === intent.challenge.payerParty;
  const other = sender
    ? intent.challenge.recipientParty
    : intent.challenge.payerParty;
  return fixtureRecord(
    `${TRANSFER_EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:EventLog_HoldingsChange`,
    [
      ["admin", fixtureScalar("party", intent.tokenFactory.expectedAdmin)],
      ["account", account(owner)],
      [
        "inputHoldingCids",
        fixtureContractIds(
          sender ? [PREPARED_PURCHASE_EFFECT_CIDS.inputHolding] : [],
        ),
      ],
      [
        "transferLegSides",
        fixtureList([
          transferLeg(intent, other, sender ? "SenderSide" : "ReceiverSide"),
        ]),
      ],
      [
        "outputHoldingCids",
        fixtureContractIds([
          sender
            ? PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding
            : PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding,
        ]),
      ],
      ["observers", fixtureList([fixtureScalar("party", owner)])],
      ["extraArgs", eventExtraArgs()],
    ],
  );
}

export function externalPreapprovalChoice(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): Value {
  const packageId = selectedSplicePackage(intent);
  const inputIds =
    request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids;
  return fixtureRecord(
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2`,
    [
      [
        "context",
        fixtureRecord(
          `${packageId}:Splice.AmuletRules:ExternalPartyTransferContext`,
          [
            [
              "externalPartyConfigState",
              fixtureScalar(
                "contractId",
                EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
              ),
            ],
            [
              "featuredAppRight",
              fixtureOptional(
                fixtureScalar(
                  "contractId",
                  EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
                ),
              ),
            ],
          ],
        ),
      ],
      [
        "inputs",
        fixtureList(
          inputIds.map((contractId) =>
            fixtureVariant(
              `${packageId}:Splice.AmuletRules:TransferInput`,
              "InputAmulet",
              fixtureScalar("contractId", contractId),
            ),
          ),
        ),
      ],
      ["amount", fixtureScalar("numeric", PRINCIPAL)],
      ["sender", fixtureScalar("party", intent.challenge.payerParty)],
      ["description", fixtureOptional()],
      ["meta", fixtureOptional(fixtureMetadata())],
    ],
  );
}

export function externalPreapprovalResult(
  intent: BoundedPurchaseLedgerIntent,
): Value {
  const packageId = selectedSplicePackage(intent);
  return fixtureRecord(
    `${packageId}:Splice.AmuletRules:TransferPreapproval_SendV2Result`,
    [
      [
        "result",
        fixtureRecord(`${packageId}:Splice.AmuletRules:TransferResult`, [
          ["round", fixtureScalar("int64", "1")],
          [
            "summary",
            fixtureRecord(
              `${packageId}:Splice.AmuletRules:TransferSummary`,
              [],
            ),
          ],
          [
            "createdAmulets",
            fixtureList([
              fixtureVariant(
                `${packageId}:Splice.AmuletRules:CreatedAmulet`,
                "TransferResultAmulet",
                fixtureScalar(
                  "contractId",
                  PREPARED_PURCHASE_EFFECT_CIDS.receiverHolding,
                ),
              ),
            ]),
          ],
          [
            "senderChangeAmulet",
            fixtureOptional(
              fixtureScalar(
                "contractId",
                PREPARED_PURCHASE_EFFECT_CIDS.senderChangeHolding,
              ),
            ),
          ],
        ]),
      ],
      ["meta", fixtureMetadata()],
    ],
  );
}
