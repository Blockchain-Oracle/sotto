import type { Create, Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { validateHumanDisclosedInputIdentity } from "./human-prepared-purchase-disclosed-input.js";
import {
  preparedIdentifier,
  preparedNumeric,
  preparedParties,
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import { damlDecimalToAtomic } from "./purchase-commitment-primitives.js";
import { FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID } from "./purchase-holding-types.js";

const TRANSFER_CONFIG_FIELDS = [
  "holdingFee",
  "maxNumInputs",
  "maxNumOutputs",
  "maxNumLockHolders",
] as const;
const DAML_REL_TIME_RECORD_ID =
  "b70db8369e1c461d5c70f1c86f526a29e9776c655e6ffc2560f95b05ccb8b946:DA.Time.Types:RelTime";
const MAX_DAML_INT = 9_223_372_036_854_775_807n;

export type HumanPreparedExternalConfig = Readonly<{
  amuletPriceAtomic: bigint;
  holdingFeeAtomic: bigint;
  round: bigint;
}>;

function nonnegativeAtomic(value: Value | undefined, label: string): bigint {
  const result = BigInt(
    damlDecimalToAtomic(preparedNumeric(value, label), label),
  );
  if (result < 0n) throw new Error(`prepared ${label} is negative`);
  return result;
}

function canonicalInt(value: Value | undefined, label: string): bigint {
  if (
    value?.sum.oneofKind !== "int64" ||
    !/^(?:0|[1-9]\d{0,18})$/u.test(value.sum.int64)
  ) {
    throw new Error(`prepared ${label} is not a nonnegative Int`);
  }
  const result = BigInt(value.sum.int64);
  if (result > MAX_DAML_INT) {
    throw new Error(`prepared ${label} is not a nonnegative Int`);
  }
  return result;
}

function requireTokenStandardTtl(value: Value | undefined): void {
  if (value?.sum.oneofKind !== "optional") {
    throw new Error("prepared human token TTL is not optional");
  }
  const relativeTime = value.sum.optional.value;
  if (relativeTime === undefined) return;
  const fields = preparedRecord(
    relativeTime,
    ["microseconds"],
    "human token TTL relative time",
    DAML_REL_TIME_RECORD_ID,
  );
  canonicalInt(fields.get("microseconds"), "human token TTL microseconds");
}

function requireTrafficBasedRewards(
  value: Value | undefined,
  packageId: string,
): void {
  if (
    value?.sum.oneofKind !== "optional" ||
    value.sum.optional.value?.sum.oneofKind !== "enum" ||
    value.sum.optional.value.sum.enum.constructor !==
      "RewardVersion_TrafficBasedAppRewards"
  ) {
    throw new Error("prepared human reward calculation version is unsupported");
  }
  preparedIdentifier(
    value.sum.optional.value.sum.enum.enumId,
    `${packageId}:Splice.AmuletConfig:RewardVersion`,
    "human reward calculation version",
  );
}

function transferConfig(
  value: Value | undefined,
  packageId: string,
  sourcePackageId: string,
  inputCount: number,
): bigint {
  const legacy = sourcePackageId === FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID;
  const config = preparedRecord(
    value,
    legacy
      ? TRANSFER_CONFIG_FIELDS
      : [...TRANSFER_CONFIG_FIELDS, "tokenStandardMaxTTL"],
    "human external transfer config",
    `${packageId}:Splice.AmuletConfig:TransferConfigV2`,
  );
  const rate = preparedRecord(
    config.get("holdingFee"),
    ["rate"],
    "human external holding fee",
    `${packageId}:Splice.Fees:RatePerRound`,
  );
  if (
    canonicalInt(config.get("maxNumInputs"), "human maximum inputs") <
      BigInt(inputCount) ||
    canonicalInt(config.get("maxNumOutputs"), "human maximum outputs") < 1n ||
    canonicalInt(
      config.get("maxNumLockHolders"),
      "human maximum lock holders",
    ) < 0n
  ) {
    throw new Error("prepared human external transfer limits are insufficient");
  }
  const ttl = config.get("tokenStandardMaxTTL");
  if (!legacy) requireTokenStandardTtl(ttl);
  return nonnegativeAtomic(rate.get("rate"), "human external holding fee rate");
}

export function validateHumanPreparedExternalConfig(
  input: Create,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): HumanPreparedExternalConfig {
  const packageId = intent.packageSelection.packageIds[0];
  const sourcePackageId = validateHumanDisclosedInputIdentity(
    input,
    request,
    "Splice.ExternalPartyConfigState",
    "ExternalPartyConfigState",
    "human external config",
  );
  preparedParties(
    input.signatories,
    [intent.tokenFactory.expectedAdmin],
    "human external config signatory",
  );
  preparedParties(
    input.stakeholders,
    [intent.tokenFactory.expectedAdmin],
    "human external config stakeholder",
  );
  const fields = preparedRecord(
    input.argument,
    [
      "dso",
      "holdingFeesOpenRoundNumber",
      "amuletPrice",
      "transferConfig",
      "targetArchiveAfter",
      "rewardCalculationVersion",
    ],
    "human external config",
    `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
  );
  preparedScalar(
    fields.get("dso"),
    "party",
    intent.tokenFactory.expectedAdmin,
    "human external config DSO",
  );
  const round = preparedRecord(
    fields.get("holdingFeesOpenRoundNumber"),
    ["number"],
    "human external config round",
    `${packageId}:Splice.Types:Round`,
  );
  const archiveAfter = fields.get("targetArchiveAfter");
  if (
    archiveAfter?.sum.oneofKind !== "timestamp" ||
    BigInt(archiveAfter.sum.timestamp) <=
      BigInt(Date.parse(request.maxRecordTime)) * 1_000n
  ) {
    throw new Error("prepared human external config archive horizon is unsafe");
  }
  requireTrafficBasedRewards(fields.get("rewardCalculationVersion"), packageId);
  const amuletPriceAtomic = nonnegativeAtomic(
    fields.get("amuletPrice"),
    "human external Amulet price",
  );
  if (amuletPriceAtomic === 0n) {
    throw new Error("prepared human external Amulet price is zero");
  }
  return Object.freeze({
    amuletPriceAtomic,
    holdingFeeAtomic: transferConfig(
      fields.get("transferConfig"),
      packageId,
      sourcePackageId,
      request.commands[0].ExerciseCommand.choiceArgument.transfer
        .inputHoldingCids.length,
    ),
    round: canonicalInt(round.get("number"), "human external config round"),
  });
}
