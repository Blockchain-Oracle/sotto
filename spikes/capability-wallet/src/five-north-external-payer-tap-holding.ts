import type { Create } from "@canton-network/core-ledger-proto";
import {
  preparedRecord,
  requirePreparedIdentifier,
  requirePreparedParties,
  requirePreparedScalar,
} from "./reference-wallet-prepared-values.js";
import type { FiveNorthExternalPayerTapInput } from "./five-north-external-payer-tap-types.js";

const PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f";
const HOLDING = `${PACKAGE_ID}:Splice.Amulet:Amulet`;

export function verifyFiveNorthExternalPayerTapHolding(
  create: Create,
  dso: string,
  input: FiveNorthExternalPayerTapInput,
): string {
  requirePreparedIdentifier(create.templateId, HOLDING, "tap holding template");
  requirePreparedParties(
    create.signatories,
    [dso, input.payerParty],
    "tap holding signatories",
  );
  requirePreparedParties(
    create.stakeholders,
    [dso, input.payerParty],
    "tap holding stakeholders",
  );
  const holding = preparedRecord(
    create.argument,
    ["dso", "owner", "amount"],
    "tap holding",
    HOLDING,
  );
  requirePreparedScalar(holding.get("dso"), "party", dso, "tap holding DSO");
  requirePreparedScalar(
    holding.get("owner"),
    "party",
    input.payerParty,
    "tap holding owner",
  );
  const expiring = preparedRecord(
    holding.get("amount"),
    ["initialAmount", "createdAt", "ratePerRound"],
    "tap holding amount",
    `${PACKAGE_ID}:Splice.Fees:ExpiringAmount`,
  );
  requirePreparedScalar(
    expiring.get("initialAmount"),
    "numeric",
    input.amount,
    "tap holding amount",
  );
  const createdAt = preparedRecord(
    expiring.get("createdAt"),
    ["number"],
    "tap holding round",
    `${PACKAGE_ID}:Splice.Types:Round`,
  );
  const roundNumber = createdAt.get("number");
  if (
    roundNumber?.sum.oneofKind !== "int64" ||
    !/^(?:0|[1-9][0-9]{0,18})$/u.test(roundNumber.sum.int64)
  ) {
    throw new Error("external payer tap holding round is invalid");
  }
  const rateRecord = preparedRecord(
    expiring.get("ratePerRound"),
    ["rate"],
    "tap holding rate",
    `${PACKAGE_ID}:Splice.Fees:RatePerRound`,
  );
  const rate = rateRecord.get("rate");
  if (
    rate?.sum.oneofKind !== "numeric" ||
    !/^(?:0|[1-9][0-9]{0,20})\.[0-9]{10}$/u.test(rate.sum.numeric)
  ) {
    throw new Error("external payer tap holding rate is invalid");
  }
  return roundNumber.sum.int64;
}
