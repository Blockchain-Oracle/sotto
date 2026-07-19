import {
  PreparedTransaction,
  type Value,
} from "@canton-network/core-ledger-proto";
import { APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID } from "@sotto/x402-canton";

export const REVOKE_PAYER =
  "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012";
export const REVOKE_AGENT =
  "sotto-policy-agent-20260713::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8";
export const REVOKE_SYNCHRONIZER =
  "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
export const REVOKE_CAPABILITY =
  "0025b865a38a3a1cea1c730549e2c281f9b8073cdc3b1bf3b1199f7aa48057f877ca121220380798b67236d566550aed355fd3688d0df4f1f5369215726d92753f121b8e4e";

function identifier(value: string) {
  const [packageId, moduleName, entityName] = value.split(":");
  if (!packageId || !moduleName || !entityName)
    throw new Error("bad fixture ID");
  return { entityName, moduleName, packageId };
}

function scalar(kind: string, value: string | boolean): Value {
  return { sum: { oneofKind: kind, [kind]: value } } as Value;
}

function record(
  entityName: string,
  fields: ReadonlyArray<readonly [string, Value]>,
): Value {
  const template = identifier(APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID);
  return {
    sum: {
      oneofKind: "record",
      record: {
        recordId: { ...template, entityName },
        fields: fields.map(([label, value]) => ({ label, value })),
      },
    },
  };
}

function capabilityArgument(): Value {
  return record("BoundedPurchaseCapability", [
    ["payer", scalar("party", REVOKE_PAYER)],
    ["agent", scalar("party", REVOKE_AGENT)],
    ["resourceBindingVersion", scalar("text", "sotto-resource-v1")],
    ["allowedResourceHash", scalar("text", `sha256:${"a".repeat(64)}`)],
    ["allowedRecipient", scalar("party", "sotto-provider::1220provider")],
    ["instrumentId", { sum: { oneofKind: "unit", unit: {} } }],
    ["perCallLimit", scalar("numeric", "0.3000000000")],
    ["remainingAllowance", scalar("numeric", "1.0000000000")],
    ["maximumTotalDebit", scalar("numeric", "0.3250000000")],
    ["expiresAt", scalar("timestamp", "1")],
    ["revision", scalar("int64", "0")],
    ["paused", scalar("bool", false)],
    ["transferFactoryCid", scalar("contractId", "00factory")],
    ["expectedAdmin", scalar("party", "DSO::1220dso")],
  ]);
}

export function preparedRevokeFixture(): Uint8Array {
  const templateId = identifier(
    APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  );
  return PreparedTransaction.toBinary(
    {
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
                    contractId: REVOKE_CAPABILITY,
                    packageName: "sotto-control",
                    templateId,
                    signatories: [REVOKE_PAYER],
                    stakeholders: [REVOKE_PAYER, REVOKE_AGENT],
                    actingParties: [REVOKE_PAYER],
                    choiceId: "Revoke",
                    chosenValue: record("Revoke", []),
                    consuming: true,
                    children: [],
                    choiceObservers: [],
                    exerciseResult: { sum: { oneofKind: "unit", unit: {} } },
                  },
                },
              },
            },
          },
        ],
        nodeSeeds: [{ nodeId: 0, seed: new Uint8Array(32).fill(7) }],
      },
      metadata: {
        synchronizerId: REVOKE_SYNCHRONIZER,
        mediatorGroup: 0,
        transactionUuid: "00000000-0000-4000-8000-000000000001",
        preparationTime: 1_000_000n,
        inputContracts: [
          {
            contract: {
              oneofKind: "v1",
              v1: {
                lfVersion: "2.1",
                contractId: REVOKE_CAPABILITY,
                packageName: "sotto-control",
                templateId,
                argument: capabilityArgument(),
                signatories: [REVOKE_PAYER],
                stakeholders: [REVOKE_PAYER, REVOKE_AGENT],
              },
            },
            createdAt: 1n,
            eventBlob: new Uint8Array([1]),
          },
        ],
        globalKeyMapping: [],
        submitterInfo: {
          actAs: [REVOKE_PAYER],
          commandId: "sotto-capability-revoke-v1-fixture",
        },
      },
    },
    { writeUnknownFields: false },
  );
}

export function mutatePreparedRevoke(
  mutate: (prepared: ReturnType<typeof PreparedTransaction.fromBinary>) => void,
): Uint8Array {
  const prepared = PreparedTransaction.fromBinary(preparedRevokeFixture());
  mutate(prepared);
  return PreparedTransaction.toBinary(prepared, { writeUnknownFields: false });
}
