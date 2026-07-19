import type { Metadata } from "@canton-network/core-ledger-proto";
import {
  requirePreparedIdentifier,
  requirePreparedParties,
} from "./reference-wallet-prepared-values.js";

const PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f";
const OPEN_ROUND_PACKAGE_ID =
  "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f";
const RULES = `${PACKAGE_ID}:Splice.AmuletRules:AmuletRules`;
const ROUND = `${OPEN_ROUND_PACKAGE_ID}:Splice.Round:OpenMiningRound`;
const MAX_INPUT_BLOB_BYTES = 2 * 1024 * 1024;

function inputById(inputs: Metadata["inputContracts"], contractId: string) {
  const found = inputs.find((input) =>
    input.contract.oneofKind === "v1"
      ? input.contract.v1.contractId === contractId
      : false,
  );
  if (found?.contract.oneofKind !== "v1") {
    throw new Error("external payer tap input contract is absent");
  }
  return { input: found, contract: found.contract.v1 };
}

export function verifyFiveNorthExternalPayerTapInputs(
  inputs: Metadata["inputContracts"],
  expected: {
    dso: string;
    roundContractId: string;
    rulesContractId: string;
  },
): void {
  if (inputs.length !== 2) {
    throw new Error("external payer tap input contracts do not match");
  }
  const round = inputById(inputs, expected.roundContractId);
  const rules = inputById(inputs, expected.rulesContractId);
  const selected = [
    [round, ROUND, "round"],
    [rules, RULES, "rules"],
  ] as const;
  let blobBytes = 0;
  for (const [{ input, contract }, templateId, label] of selected) {
    blobBytes += input.eventBlob.byteLength;
    if (
      input.eventBlob.byteLength === 0 ||
      input.createdAt <= 0n ||
      contract.lfVersion !== "2.1" ||
      contract.packageName !== "splice-amulet"
    ) {
      throw new Error(`external payer tap ${label} input is invalid`);
    }
    requirePreparedIdentifier(
      contract.templateId,
      templateId,
      `tap ${label} input template`,
    );
    requirePreparedParties(
      contract.signatories,
      [expected.dso],
      `tap ${label} input signatories`,
    );
    requirePreparedParties(
      contract.stakeholders,
      [expected.dso],
      `tap ${label} input stakeholders`,
    );
  }
  if (blobBytes > MAX_INPUT_BLOB_BYTES) {
    throw new Error("external payer tap input contract blobs are oversized");
  }
}
