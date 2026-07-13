import {
  PreparedTransaction,
  type Value,
} from "@canton-network/core-ledger-proto";
import type {
  BoundedPurchaseLedgerIntent,
  BoundedPurchasePrepareRequest,
} from "../src/index.js";

export type PreparedPurchaseFixture = ReturnType<
  typeof PreparedTransaction.create
>;

function identifier(templateId: string) {
  const [packageId, moduleName, entityName] = templateId.split(":");
  if (!packageId || !moduleName || !entityName) {
    throw new Error("test template identifier is invalid");
  }
  return { packageId, moduleName, entityName };
}

function scalar(oneofKind: string, value: string): Value {
  return { sum: { oneofKind, [oneofKind]: value } } as Value;
}

function record(fields: ReadonlyArray<readonly [string, Value]>): Value {
  return {
    sum: {
      oneofKind: "record",
      record: {
        fields: fields.map(([label, value]) => ({ label, value })),
      },
    },
  };
}

function choiceArgument(request: BoundedPurchasePrepareRequest): Value {
  const argument = request.commands[0]!.ExerciseCommand.choiceArgument;
  const timestamp = (value: string) =>
    scalar("timestamp", (BigInt(Date.parse(value)) * 1000n).toString());
  return record([
    ["attemptId", scalar("text", argument.attemptId)],
    ["purchaseCommitment", scalar("text", argument.purchaseCommitment)],
    ["requestCommitment", scalar("text", argument.requestCommitment)],
    ["challengeId", scalar("text", argument.challengeId)],
    ["resourceHash", scalar("text", argument.resourceHash)],
    ["recipient", scalar("party", argument.recipient)],
    ["amount", scalar("numeric", argument.amount)],
    ["requestedAt", timestamp(argument.requestedAt)],
    ["executeBefore", timestamp(argument.executeBefore)],
    [
      "inputHoldingCids",
      {
        sum: {
          oneofKind: "list",
          list: {
            elements: argument.inputHoldingCids.map((contractId) =>
              scalar("contractId", contractId),
            ),
          },
        },
      },
    ],
    [
      "extraArgs",
      record([
        ["context", record([])],
        ["meta", record([])],
      ]),
    ],
    ["expectedRevision", scalar("int64", argument.expectedRevision)],
  ]);
}

export function validPreparedPurchase(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): PreparedPurchaseFixture {
  const requestedAtMicros =
    BigInt(Date.parse(intent.challenge.requestedAt)) * 1000n;
  const executeBeforeMicros = BigInt(Date.parse(request.maxRecordTime)) * 1000n;
  const preparationTime =
    BigInt(Date.parse("2026-07-13T10:00:02.000Z")) * 1000n;
  return PreparedTransaction.create({
    transaction: {
      version: "2.1",
      roots: ["0"],
      nodes: [
        {
          nodeId: "0",
          versionedNode: {
            oneofKind: "v1",
            v1: {
              nodeType: {
                oneofKind: "exercise",
                exercise: {
                  lfVersion: "2.1",
                  contractId: intent.capability.contractId,
                  packageName: "sotto-control",
                  templateId: identifier(intent.capability.templateId),
                  signatories: [intent.challenge.payerParty],
                  stakeholders: [
                    intent.challenge.payerParty,
                    intent.capability.agentParty,
                  ],
                  actingParties: [intent.capability.agentParty],
                  choiceId: "Purchase",
                  chosenValue: choiceArgument(request),
                  consuming: true,
                  children: [],
                  choiceObservers: [],
                },
              },
            },
          },
        },
      ],
      nodeSeeds: [{ nodeId: 0, seed: new Uint8Array(32).fill(7) }],
    },
    metadata: {
      submitterInfo: {
        actAs: [intent.capability.agentParty],
        commandId: request.commandId,
      },
      synchronizerId: request.synchronizerId,
      mediatorGroup: 0,
      transactionUuid: "00000000-0000-4000-8000-000000000001",
      preparationTime,
      inputContracts: [],
      globalKeyMapping: [],
      minLedgerEffectiveTime: requestedAtMicros + 1n,
      maxLedgerEffectiveTime: executeBeforeMicros - 1n,
      maxRecordTime: executeBeforeMicros,
    },
  });
}

export function preparedPurchaseBytes(
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  mutate?: (prepared: PreparedPurchaseFixture) => void,
): Uint8Array {
  const prepared = validPreparedPurchase(intent, request);
  mutate?.(prepared);
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}
