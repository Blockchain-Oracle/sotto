import type { Create, Value } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import { referenceHumanWalletSelectedTemplate } from "./reference-human-wallet-input-primitives.js";
import {
  referenceHumanWalletInt64,
  referenceHumanWalletNonnegativeAtomic,
  referenceHumanWalletRound,
} from "./reference-human-wallet-numbers.js";
import {
  referenceHumanIdentifier,
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

const RELATIVE_TIME_ID =
  "b70db8369e1c461d5c70f1c86f526a29e9776c655e6ffc2560f95b05ccb8b946:DA.Time.Types:RelTime";

export type ReferenceHumanWalletExternalConfig = Readonly<{
  amuletPriceAtomic: bigint;
  holdingFeeAtomic: bigint;
  round: bigint;
}>;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function optionalTtl(value: Value | undefined): void {
  if (value?.sum.oneofKind !== "optional") fail("token TTL");
  if (value.sum.optional.value === undefined) return;
  const fields = referenceHumanRecord(
    value.sum.optional.value,
    ["microseconds"],
    "token TTL",
    RELATIVE_TIME_ID,
  );
  referenceHumanWalletInt64(fields.get("microseconds"), "token TTL");
}

function rewardMode(value: Value | undefined, packageId: string): void {
  if (
    value?.sum.oneofKind !== "optional" ||
    value.sum.optional.value?.sum.oneofKind !== "enum" ||
    value.sum.optional.value.sum.enum.constructor !==
      "RewardVersion_TrafficBasedAppRewards"
  ) {
    fail("reward mode");
  }
  referenceHumanIdentifier(
    value.sum.optional.value.sum.enum.enumId,
    `${packageId}:Splice.AmuletConfig:RewardVersion`,
    "reward mode",
  );
}

function transferConfig(
  value: Value | undefined,
  packageId: string,
  inputCount: number,
): bigint {
  if (value?.sum.oneofKind !== "record") fail("transfer config");
  const hasTtl = value.sum.record.fields.some(
    ({ label }) => label === "tokenStandardMaxTTL",
  );
  const fields = referenceHumanRecord(
    value,
    [
      "holdingFee",
      "maxNumInputs",
      "maxNumOutputs",
      "maxNumLockHolders",
      ...(hasTtl ? ["tokenStandardMaxTTL"] : []),
    ],
    "transfer config",
    `${packageId}:Splice.AmuletConfig:TransferConfigV2`,
  );
  const holdingFee = referenceHumanRecord(
    fields.get("holdingFee"),
    ["rate"],
    "holding fee rate",
    `${packageId}:Splice.Fees:RatePerRound`,
  );
  if (
    referenceHumanWalletInt64(fields.get("maxNumInputs"), "maximum inputs") <
      BigInt(inputCount) ||
    referenceHumanWalletInt64(fields.get("maxNumOutputs"), "maximum outputs") <
      1n
  ) {
    fail("transfer limits");
  }
  referenceHumanWalletInt64(
    fields.get("maxNumLockHolders"),
    "maximum lock holders",
  );
  if (hasTtl) optionalTtl(fields.get("tokenStandardMaxTTL"));
  return referenceHumanWalletNonnegativeAtomic(
    holdingFee.get("rate"),
    "holding fee rate",
  );
}

export function validateReferenceHumanWalletExternalConfig(
  candidate: Create,
  request: HumanWalletApprovalRequest,
  inputCount: number,
): ReferenceHumanWalletExternalConfig {
  const approval = request.approval;
  const packageId = approval.selectedPackage.packageId;
  referenceHumanWalletSelectedTemplate(
    candidate,
    request,
    "Splice.ExternalPartyConfigState",
    "ExternalPartyConfigState",
    "external config input",
  );
  referenceHumanParties(
    candidate.signatories,
    [approval.tokenFactory.expectedAdmin],
    "external config signatory",
  );
  referenceHumanParties(
    candidate.stakeholders,
    [approval.tokenFactory.expectedAdmin],
    "external config stakeholder",
  );
  const fields = referenceHumanRecord(
    candidate.argument,
    [
      "dso",
      "holdingFeesOpenRoundNumber",
      "amuletPrice",
      "transferConfig",
      "targetArchiveAfter",
      "rewardCalculationVersion",
    ],
    "external config input",
    `${packageId}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
  );
  referenceHumanScalar(
    fields.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    "external config DSO",
  );
  const archiveAfter = fields.get("targetArchiveAfter");
  if (
    archiveAfter?.sum.oneofKind !== "timestamp" ||
    !/^(?:0|[1-9][0-9]{0,18})$/u.test(archiveAfter.sum.timestamp) ||
    BigInt(archiveAfter.sum.timestamp) <=
      BigInt(Date.parse(approval.executeBefore)) * 1_000n
  ) {
    fail("external config archive horizon");
  }
  rewardMode(fields.get("rewardCalculationVersion"), packageId);
  const amuletPriceAtomic = referenceHumanWalletNonnegativeAtomic(
    fields.get("amuletPrice"),
    "external config price",
  );
  if (amuletPriceAtomic === 0n) fail("external config price");
  return Object.freeze({
    amuletPriceAtomic,
    holdingFeeAtomic: transferConfig(
      fields.get("transferConfig"),
      packageId,
      inputCount,
    ),
    round: referenceHumanWalletRound(
      fields.get("holdingFeesOpenRoundNumber"),
      packageId,
      "external config round",
    ),
  });
}
