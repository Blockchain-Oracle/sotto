import type { Value } from "@canton-network/core-ledger-proto";
import { referenceHumanRecord } from "./reference-human-wallet-values.js";

const SIGNED_DECIMAL = /^(-?)(?:0|[1-9][0-9]{0,27})(?:\.([0-9]{1,10}))?$/u;
const SCALE = 10_000_000_000n;
const MAX_DAML_INT = 9_223_372_036_854_775_807n;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function referenceHumanWalletSignedAtomic(
  value: Value | undefined,
  label: string,
): bigint {
  if (value?.sum.oneofKind !== "numeric") fail(label);
  const decimal = value.sum.numeric;
  const match = SIGNED_DECIMAL.exec(decimal);
  if (match === null) fail(label);
  const unsigned = decimal.startsWith("-") ? decimal.slice(1) : decimal;
  const [whole, fraction = ""] = unsigned.split(".");
  const atomic = BigInt(whole!) * SCALE + BigInt(fraction.padEnd(10, "0"));
  if (atomic.toString().length > 38 || (match[1] === "-" && atomic === 0n)) {
    fail(label);
  }
  return match[1] === "-" ? -atomic : atomic;
}

export function referenceHumanWalletNonnegativeAtomic(
  value: Value | undefined,
  label: string,
): bigint {
  const result = referenceHumanWalletSignedAtomic(value, label);
  if (result < 0n) fail(label);
  return result;
}

export function referenceHumanWalletInt64(
  value: Value | undefined,
  label: string,
): bigint {
  if (
    value?.sum.oneofKind !== "int64" ||
    !/^(?:0|[1-9][0-9]{0,18})$/u.test(value.sum.int64)
  ) {
    fail(label);
  }
  const result = BigInt(value.sum.int64);
  if (result > MAX_DAML_INT) fail(label);
  return result;
}

export function referenceHumanWalletRound(
  value: Value | undefined,
  packageId: string,
  label: string,
): bigint {
  const fields = referenceHumanRecord(
    value,
    ["number"],
    label,
    `${packageId}:Splice.Types:Round`,
  );
  return referenceHumanWalletInt64(fields.get("number"), label);
}

export function referenceHumanWalletScale(): bigint {
  return SCALE;
}
