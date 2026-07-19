import {
  PreparedTransaction,
  type Value,
} from "@canton-network/core-ledger-proto";

export const TAP_PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f";
export const TAP_OPEN_ROUND_PACKAGE_ID =
  "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f";
export const TAP_PAYER = "sotto-external-payer::1220payer";
export const TAP_DSO = "DSO::1220dso";
export const TAP_SYNCHRONIZER = "global-domain::1220sync";
export const TAP_AMOUNT = "1.0000000000";

const RULES = `${TAP_PACKAGE_ID}:Splice.AmuletRules:AmuletRules`;
const ROUND = `${TAP_PACKAGE_ID}:Splice.Round:OpenMiningRound`;
const HOLDING = `${TAP_PACKAGE_ID}:Splice.Amulet:Amulet`;
const CREATED_HOLDING = "00payer-holding";

function identifier(value: string) {
  const [packageId, moduleName, entityName] = value.split(":");
  if (!packageId || !moduleName || !entityName)
    throw new Error("bad fixture ID");
  return { packageId, moduleName, entityName };
}

function scalar(kind: string, value: string): Value {
  return { sum: { oneofKind: kind, [kind]: value } } as Value;
}

function record(
  id: string,
  fields: ReadonlyArray<readonly [string, Value]>,
): Value {
  return {
    sum: {
      oneofKind: "record",
      record: {
        recordId: identifier(id),
        fields: fields.map(([label, value]) => ({ label, value })),
      },
    },
  };
}

function tapArgument(choice: "AmuletRules_DevNet_Tap" | "AmuletRules_Mint") {
  return record(`${RULES}_${choice.replace("AmuletRules_", "")}`, [
    ["receiver", scalar("party", TAP_PAYER)],
    ["amount", scalar("numeric", TAP_AMOUNT)],
    ["openRound", scalar("contractId", "00open-round")],
  ]);
}

function holdingArgument(): Value {
  return record(HOLDING, [
    ["dso", scalar("party", TAP_DSO)],
    ["owner", scalar("party", TAP_PAYER)],
    [
      "amount",
      record(`${TAP_PACKAGE_ID}:Splice.Fees:ExpiringAmount`, [
        ["initialAmount", scalar("numeric", TAP_AMOUNT)],
        [
          "createdAt",
          record(`${TAP_PACKAGE_ID}:Splice.Types:Round`, [
            ["number", scalar("int64", "7")],
          ]),
        ],
        [
          "ratePerRound",
          record(`${TAP_PACKAGE_ID}:Splice.Fees:RatePerRound`, [
            ["rate", scalar("numeric", "0.0001426572")],
          ]),
        ],
      ]),
    ],
  ]);
}

function createSummary(): Value {
  return record(`${TAP_PACKAGE_ID}:Splice.Amulet:AmuletCreateSummary`, [
    ["amulet", scalar("contractId", CREATED_HOLDING)],
    ["amuletPrice", scalar("numeric", "0.1333680000")],
    [
      "round",
      record(`${TAP_PACKAGE_ID}:Splice.Types:Round`, [
        ["number", scalar("int64", "7")],
      ]),
    ],
  ]);
}

function mintResult(): Value {
  return record(`${RULES}_MintResult`, [["amuletSum", createSummary()]]);
}

function tapResult(): Value {
  const metadata = record(
    "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f:Splice.Api.Token.MetadataV1:Metadata",
    [
      [
        "values",
        {
          sum: {
            oneofKind: "textMap",
            textMap: {
              entries: [
                {
                  key: "splice.lfdecentralizedtrust.org/reason",
                  value: scalar("text", "tapped faucet"),
                },
                {
                  key: "splice.lfdecentralizedtrust.org/tx-kind",
                  value: scalar("text", "mint"),
                },
              ],
            },
          },
        },
      ],
    ],
  );
  return record(`${RULES}_DevNet_TapResult`, [
    ["amuletSum", createSummary()],
    ["meta", { sum: { oneofKind: "optional", optional: { value: metadata } } }],
  ]);
}

function inputContract(contractId: string, templateId: string, marker: number) {
  return {
    contract: {
      oneofKind: "v1" as const,
      v1: {
        lfVersion: "2.1",
        contractId,
        packageName: "splice-amulet",
        templateId: identifier(templateId),
        argument: record(templateId, []),
        signatories: [TAP_DSO],
        stakeholders: [TAP_DSO],
      },
    },
    createdAt: BigInt(marker),
    eventBlob: new Uint8Array([marker]),
  };
}

export function preparedTapFixture(): Uint8Array {
  return PreparedTransaction.toBinary(
    {
      transaction: {
        version: "2.1",
        roots: ["0"],
        nodes: [
          {
            nodeId: "2",
            versionedNode: {
              oneofKind: "v1",
              v1: {
                nodeType: {
                  oneofKind: "fetch",
                  fetch: {
                    lfVersion: "2.1",
                    contractId: "00open-round",
                    packageName: "splice-amulet",
                    templateId: identifier(ROUND),
                    signatories: [TAP_DSO],
                    stakeholders: [TAP_DSO],
                    actingParties: [TAP_DSO],
                  },
                },
              },
            },
          },
          {
            nodeId: "3",
            versionedNode: {
              oneofKind: "v1",
              v1: {
                nodeType: {
                  oneofKind: "create",
                  create: {
                    lfVersion: "2.1",
                    contractId: CREATED_HOLDING,
                    packageName: "splice-amulet",
                    templateId: identifier(HOLDING),
                    argument: holdingArgument(),
                    signatories: [TAP_DSO, TAP_PAYER],
                    stakeholders: [TAP_DSO, TAP_PAYER],
                  },
                },
              },
            },
          },
          {
            nodeId: "1",
            versionedNode: {
              oneofKind: "v1",
              v1: {
                nodeType: {
                  oneofKind: "exercise",
                  exercise: {
                    lfVersion: "2.1",
                    contractId: "00amulet-rules",
                    packageName: "splice-amulet",
                    templateId: identifier(RULES),
                    signatories: [TAP_DSO],
                    stakeholders: [TAP_DSO],
                    actingParties: [TAP_DSO, TAP_PAYER],
                    choiceId: "AmuletRules_Mint",
                    chosenValue: tapArgument("AmuletRules_Mint"),
                    consuming: false,
                    children: ["2", "3"],
                    choiceObservers: [],
                    exerciseResult: mintResult(),
                  },
                },
              },
            },
          },
          {
            nodeId: "0",
            versionedNode: {
              oneofKind: "v1",
              v1: {
                nodeType: {
                  oneofKind: "exercise",
                  exercise: {
                    lfVersion: "2.1",
                    contractId: "00amulet-rules",
                    packageName: "splice-amulet",
                    templateId: identifier(RULES),
                    signatories: [TAP_DSO],
                    stakeholders: [TAP_DSO],
                    actingParties: [TAP_PAYER],
                    choiceId: "AmuletRules_DevNet_Tap",
                    chosenValue: tapArgument("AmuletRules_DevNet_Tap"),
                    consuming: false,
                    children: ["1"],
                    choiceObservers: [],
                    exerciseResult: tapResult(),
                  },
                },
              },
            },
          },
        ],
        nodeSeeds: [0, 1, 3].map((nodeId) => ({
          nodeId,
          seed: new Uint8Array(32).fill(nodeId + 1),
        })),
      },
      metadata: {
        synchronizerId: TAP_SYNCHRONIZER,
        mediatorGroup: 0,
        transactionUuid: "00000000-0000-4000-8000-000000000001",
        preparationTime: 1_000_000n,
        inputContracts: [
          inputContract(
            "00open-round",
            `${TAP_OPEN_ROUND_PACKAGE_ID}:Splice.Round:OpenMiningRound`,
            1,
          ),
          inputContract("00amulet-rules", RULES, 2),
        ],
        globalKeyMapping: [],
        submitterInfo: {
          actAs: [TAP_PAYER],
          commandId: "sotto-devnet-tap-test",
        },
      },
    },
    { writeUnknownFields: false },
  );
}

export function mutatePreparedTap(
  mutate: (prepared: ReturnType<typeof PreparedTransaction.fromBinary>) => void,
): Uint8Array {
  const prepared = PreparedTransaction.fromBinary(preparedTapFixture(), {
    readUnknownField: "throw",
  });
  mutate(prepared);
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}
