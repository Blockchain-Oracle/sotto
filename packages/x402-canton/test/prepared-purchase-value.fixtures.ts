import type { Identifier, Value } from "@canton-network/core-ledger-proto";
import type {
  BoundedPurchaseLedgerIntent,
  BoundedPurchasePrepareRequest,
} from "../src/index.js";

const METADATA_PACKAGE_ID =
  "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f";

export function fixtureIdentifier(value: string): Identifier {
  const [packageId, moduleName, entityName] = value.split(":");
  if (!packageId || !moduleName || !entityName) {
    throw new Error("test identifier is invalid");
  }
  return { packageId, moduleName, entityName };
}

export function fixtureScalar(kind: string, value: string | boolean): Value {
  return { sum: { oneofKind: kind, [kind]: value } } as Value;
}

export function fixtureRecord(
  recordId: string,
  fields: ReadonlyArray<readonly [string, Value]>,
): Value {
  return {
    sum: {
      oneofKind: "record",
      record: {
        recordId: fixtureIdentifier(recordId),
        fields: fields.map(([label, value]) => ({ label, value })),
      },
    },
  };
}

export function fixtureContractIds(values: readonly string[]): Value {
  return {
    sum: {
      oneofKind: "list",
      list: {
        elements: values.map((value) => fixtureScalar("contractId", value)),
      },
    },
  };
}

export function fixtureTimestamp(value: string): Value {
  return fixtureScalar(
    "timestamp",
    (BigInt(Date.parse(value)) * 1_000n).toString(),
  );
}

function fixtureTextMap(values: Readonly<Record<string, string>>): Value {
  return {
    sum: {
      oneofKind: "textMap",
      textMap: {
        entries: Object.entries(values)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => ({
            key,
            value: fixtureScalar("text", value),
          })),
      },
    },
  };
}

export function fixtureMetadata(
  values: Readonly<Record<string, string>> = {},
): Value {
  return fixtureRecord(
    `${METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:Metadata`,
    [["values", fixtureTextMap(values)]],
  );
}

export function fixtureExtraArgs(
  request: BoundedPurchasePrepareRequest,
): Value {
  const source = request.commands[0]!.ExerciseCommand.choiceArgument.extraArgs;
  const context = source.context as { values?: unknown };
  if (
    typeof context.values !== "object" ||
    context.values === null ||
    Object.values(context.values).some((value) => typeof value !== "string")
  ) {
    throw new Error("test choice context is invalid");
  }
  return fixtureRecord(
    `${METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ExtraArgs`,
    [
      [
        "context",
        fixtureRecord(
          `${METADATA_PACKAGE_ID}:Splice.Api.Token.MetadataV1:ChoiceContext`,
          [
            [
              "values",
              fixtureTextMap(context.values as Record<string, string>),
            ],
          ],
        ),
      ],
      ["meta", fixtureMetadata()],
    ],
  );
}

export function fixtureInstrument(
  intent: BoundedPurchaseLedgerIntent,
  holdingInterfaceId: string,
): Value {
  return fixtureRecord(
    `${fixtureIdentifier(holdingInterfaceId).packageId}:Splice.Api.Token.HoldingV1:InstrumentId`,
    [
      ["admin", fixtureScalar("party", intent.challenge.instrument.admin)],
      ["id", fixtureScalar("text", intent.challenge.instrument.id)],
    ],
  );
}
