import {
  HUMAN_SETTLEMENT_EXPECTATION_VERSION,
  readAuthenticatedHumanSettlementExpectation,
  registerRestoredHumanSettlementExpectation,
  type HumanSettlementExpectation,
  type HumanSettlementExpectationSnapshot,
} from "./human-settlement-expectation.js";
import {
  exactKeys,
  identifier,
  objectValue,
  sha256Hex,
} from "./purchase-commitment-primitives.js";
import {
  persistedHumanSettlementAmount,
  persistedHumanSettlementContextIds,
  persistedHumanSettlementInputs,
  persistedHumanSettlementPackageId,
  persistedHumanSettlementSha,
} from "./human-settlement-expectation-persistence-primitives.js";

export const HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA =
  "sotto-human-settlement-expectation-journal-v1" as const;

export type PersistedHumanSettlementExpectation = Readonly<{
  schema: typeof HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA;
  expectation: HumanSettlementExpectationSnapshot;
  authorityDigest: `sha256:${string}`;
}>;

function snapshot(value: unknown): HumanSettlementExpectationSnapshot {
  const source = objectValue(value, "persisted human settlement expectation");
  exactKeys(
    source,
    [
      "version",
      "commandId",
      "attemptId",
      "challengeId",
      "requestCommitment",
      "purchaseCommitment",
      "payerParty",
      "providerParty",
      "amount",
      "dsoParty",
      "synchronizerId",
      "packageId",
      "transferFactoryContractId",
      "inputHoldingContractIds",
      "transferPreapprovalContractId",
      "choiceContextContractIds",
      "amuletTemplateId",
      "transferPreapprovalTemplateId",
    ],
    "persisted human settlement expectation",
  );
  if (source.version !== HUMAN_SETTLEMENT_EXPECTATION_VERSION) {
    throw new Error(
      "persisted human settlement expectation version is invalid",
    );
  }
  const purchaseCommitment = persistedHumanSettlementSha(
    source.purchaseCommitment,
    "persisted human purchase commitment",
  );
  const commandId = identifier(
    source.commandId,
    "persisted human settlement command ID",
    512,
  );
  if (commandId !== `sotto-human-purchase-v1-${purchaseCommitment.slice(7)}`) {
    throw new Error("persisted human settlement command does not match");
  }
  const selectedPackage = persistedHumanSettlementPackageId(source.packageId);
  const context = persistedHumanSettlementContextIds(
    source.choiceContextContractIds,
  );
  const preapproval = identifier(
    source.transferPreapprovalContractId,
    "persisted human settlement preapproval",
    4_096,
  );
  if (preapproval !== context["transfer-preapproval"]) {
    throw new Error("persisted human settlement preapproval does not match");
  }
  const amount = persistedHumanSettlementAmount(source.amount);
  const amuletTemplateId = `${selectedPackage}:Splice.Amulet:Amulet`;
  const transferPreapprovalTemplateId = `${selectedPackage}:Splice.AmuletRules:TransferPreapproval`;
  if (
    source.amuletTemplateId !== amuletTemplateId ||
    source.transferPreapprovalTemplateId !== transferPreapprovalTemplateId
  ) {
    throw new Error("persisted human settlement templates do not match");
  }
  return Object.freeze({
    version: HUMAN_SETTLEMENT_EXPECTATION_VERSION,
    commandId,
    attemptId: persistedHumanSettlementSha(
      source.attemptId,
      "persisted human attempt ID",
    ),
    challengeId: persistedHumanSettlementSha(
      source.challengeId,
      "persisted human challenge ID",
    ),
    requestCommitment: persistedHumanSettlementSha(
      source.requestCommitment,
      "persisted human request commitment",
    ),
    purchaseCommitment,
    payerParty: identifier(source.payerParty, "persisted human payer", 4_096),
    providerParty: identifier(
      source.providerParty,
      "persisted human provider",
      4_096,
    ),
    amount,
    dsoParty: identifier(source.dsoParty, "persisted human DSO", 4_096),
    synchronizerId: identifier(
      source.synchronizerId,
      "persisted human synchronizer",
      4_096,
    ),
    packageId: selectedPackage,
    transferFactoryContractId: identifier(
      source.transferFactoryContractId,
      "persisted human TransferFactory",
      4_096,
    ),
    inputHoldingContractIds: persistedHumanSettlementInputs(
      source.inputHoldingContractIds,
    ),
    transferPreapprovalContractId: preapproval,
    choiceContextContractIds: context,
    amuletTemplateId,
    transferPreapprovalTemplateId,
  });
}

function authorityDigest(
  expectation: HumanSettlementExpectationSnapshot,
): `sha256:${string}` {
  return `sha256:${sha256Hex(
    JSON.stringify({
      schema: HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA,
      expectation,
    }),
  )}`;
}

export function exportHumanSettlementExpectation(
  candidate: HumanSettlementExpectation,
): PersistedHumanSettlementExpectation {
  const expectation = snapshot(
    readAuthenticatedHumanSettlementExpectation(candidate),
  );
  return Object.freeze({
    schema: HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA,
    expectation,
    authorityDigest: authorityDigest(expectation),
  });
}

export function restoreHumanSettlementExpectation(
  value: unknown,
): HumanSettlementExpectation {
  const persisted = objectValue(value, "persisted human settlement authority");
  exactKeys(
    persisted,
    ["schema", "expectation", "authorityDigest"],
    "persisted human settlement authority",
  );
  if (persisted.schema !== HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA) {
    throw new Error("persisted human settlement schema is unsupported");
  }
  const expectation = snapshot(persisted.expectation);
  if (
    persistedHumanSettlementSha(
      persisted.authorityDigest,
      "persisted human settlement digest",
    ) !== authorityDigest(expectation)
  ) {
    throw new Error(
      "persisted human settlement authority digest does not match",
    );
  }
  return registerRestoredHumanSettlementExpectation(expectation);
}
