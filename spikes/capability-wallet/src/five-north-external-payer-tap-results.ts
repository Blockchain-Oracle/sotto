import type { Value } from "@canton-network/core-ledger-proto";
import {
  preparedRecord,
  requirePreparedScalar,
} from "./reference-wallet-prepared-values.js";

const PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f";
const RULES = `${PACKAGE_ID}:Splice.AmuletRules:AmuletRules`;
const METADATA_ID =
  "4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f:Splice.Api.Token.MetadataV1:Metadata";
const DECIMAL = /^(?:0|[1-9][0-9]{0,20})\.[0-9]{10}$/u;
const INT = /^(?:0|[1-9][0-9]{0,18})$/u;

function scalar(
  value: Value | undefined,
  kind: "int64" | "numeric",
  label: string,
): string {
  if (value?.sum.oneofKind !== kind) {
    throw new Error(`external payer tap ${label} type does not match`);
  }
  return kind === "int64"
    ? (value.sum as { oneofKind: "int64"; int64: string }).int64
    : (value.sum as { oneofKind: "numeric"; numeric: string }).numeric;
}

function summary(value: Value | undefined, expectedHolding: string) {
  const fields = preparedRecord(
    value,
    ["amulet", "amuletPrice", "round"],
    "tap result summary",
    `${PACKAGE_ID}:Splice.Amulet:AmuletCreateSummary`,
  );
  requirePreparedScalar(
    fields.get("amulet"),
    "contractId",
    expectedHolding,
    "tap result holding",
  );
  const price = scalar(fields.get("amuletPrice"), "numeric", "price");
  if (!DECIMAL.test(price) || BigInt(price.replace(".", "")) <= 0n) {
    throw new Error("external payer tap price is invalid");
  }
  const round = preparedRecord(
    fields.get("round"),
    ["number"],
    "tap result round",
    `${PACKAGE_ID}:Splice.Types:Round`,
  );
  const number = scalar(round.get("number"), "int64", "round");
  if (!INT.test(number)) throw new Error("external payer tap round is invalid");
  return { number, price };
}

function tapMetadata(value: Value | undefined): void {
  if (
    value?.sum.oneofKind !== "optional" ||
    value.sum.optional.value === undefined
  ) {
    throw new Error("external payer tap result metadata is absent");
  }
  const metadata = preparedRecord(
    value.sum.optional.value,
    ["values"],
    "tap result metadata",
    METADATA_ID,
  );
  const values = metadata.get("values");
  if (values?.sum.oneofKind !== "textMap") {
    throw new Error("external payer tap result metadata is invalid");
  }
  const entries = values.sum.textMap.entries;
  const map = new Map(entries.map(({ key, value: entry }) => [key, entry]));
  if (map.size !== 2 || entries.length !== 2) {
    throw new Error("external payer tap result metadata does not match");
  }
  requirePreparedScalar(
    map.get("splice.lfdecentralizedtrust.org/reason"),
    "text",
    "tapped faucet",
    "tap result reason",
  );
  requirePreparedScalar(
    map.get("splice.lfdecentralizedtrust.org/tx-kind"),
    "text",
    "mint",
    "tap result kind",
  );
}

export function verifyFiveNorthExternalPayerTapResults(input: {
  createdHoldingId: string;
  createdRound: string;
  mintResult: Value | undefined;
  rootResult: Value | undefined;
}): void {
  const mint = preparedRecord(
    input.mintResult,
    ["amuletSum"],
    "tap mint result",
    `${RULES}_MintResult`,
  );
  const root = preparedRecord(
    input.rootResult,
    ["amuletSum", "meta"],
    "tap root result",
    `${RULES}_DevNet_TapResult`,
  );
  const mintSummary = summary(mint.get("amuletSum"), input.createdHoldingId);
  const rootSummary = summary(root.get("amuletSum"), input.createdHoldingId);
  if (
    JSON.stringify(mintSummary) !== JSON.stringify(rootSummary) ||
    rootSummary.number !== input.createdRound
  ) {
    throw new Error("external payer tap result summaries do not match");
  }
  tapMetadata(root.get("meta"));
}
