import type { Value } from "@canton-network/core-ledger-proto";
import type {
  HumanPurchaseLedgerIntent,
  HumanPurchasePrepareRequest,
} from "../src/index.js";
import { PREPARED_PURCHASE_EFFECT_CIDS } from "./prepared-purchase-effect-values.fixtures.js";
import {
  externalEventChoice,
  externalPreapprovalChoice,
} from "./prepared-purchase-external-values.fixtures.js";
import {
  fixtureContractIds,
  fixtureIdentifier,
  fixtureMetadata,
  fixtureRecord,
} from "./prepared-purchase-value.fixtures.js";
import {
  humanResultMetadata,
  humanTransferMetadata,
} from "./human-prepared-purchase-token-metadata.fixtures.js";

function field(value: Value | undefined, label: string): Value {
  if (value?.sum.oneofKind !== "record") throw new Error("record is absent");
  const entry = value.sum.record.fields.find((item) => item.label === label);
  if (entry?.value === undefined) throw new Error(`${label} is absent`);
  return entry.value;
}

function replaceField(value: Value, label: string, replacement: Value): void {
  if (value.sum.oneofKind !== "record") throw new Error("record is absent");
  const entry = value.sum.record.fields.find((item) => item.label === label);
  if (entry === undefined) throw new Error(`${label} is absent`);
  entry.value = replacement;
}

function optional(value: Value): Value {
  return { sum: { oneofKind: "optional", optional: { value } } };
}

export function humanFactoryResult(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): Value {
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
      ["meta", fixtureMetadata(humanResultMetadata(intent, request))],
    ],
  );
}

export function humanPreapprovalChoice(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): Value {
  const source = request.commands[0].ExerciseCommand.choiceArgument;
  const value = externalPreapprovalChoice(
    intent as never,
    {
      commands: [
        {
          ExerciseCommand: {
            choiceArgument: {
              amount: source.transfer.amount,
              inputHoldingCids: source.transfer.inputHoldingCids,
            },
          },
        },
      ],
    } as never,
  );
  replaceField(
    value,
    "meta",
    optional(fixtureMetadata(humanTransferMetadata(request))),
  );
  return value;
}

export function humanEventChoice(
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
  owner: string,
): Value {
  const value = externalEventChoice(intent as never, owner);
  if (owner === intent.challenge.payerParty) {
    replaceField(
      value,
      "inputHoldingCids",
      fixtureContractIds(
        request.commands[0].ExerciseCommand.choiceArgument.transfer
          .inputHoldingCids,
      ),
    );
  }
  const legs = field(value, "transferLegSides");
  if (legs.sum.oneofKind !== "list") throw new Error("event legs are absent");
  for (const leg of legs.sum.list.elements) {
    replaceField(leg, "meta", fixtureMetadata(humanTransferMetadata(request)));
  }
  return value;
}
