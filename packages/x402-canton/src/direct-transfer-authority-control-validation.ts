import { utf8Compare } from "./package-preference-artifact-validation.js";
import { readAuthenticatedPackagePreferenceProjection } from "./package-preference-projection-state.js";
import { REQUIRED_PACKAGE_NAMES } from "./package-preference-observation-validation.js";
import { FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID } from "./purchase-commitment-validation.js";
import { canonicalTime, identifier } from "./purchase-commitment-primitives.js";
import { digestTransferFactoryChoiceArguments } from "./transfer-factory-choice.js";
import type { DirectTransferAuthorityControlInput } from "./direct-transfer-authority-control-types.js";

function exactStrings(left: readonly string[], right: readonly string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateDirectTransferPackageSelection(
  input: DirectTransferAuthorityControlInput,
): readonly [string, ...string[]] {
  const projection = readAuthenticatedPackagePreferenceProjection(
    input.packageSelection,
  );
  const receiver = input.probe.choiceArguments.transfer.receiver;
  const expectedParties = [input.agentParty, input.payerParty, receiver].sort(
    utf8Compare,
  );
  const referenceNames = projection.references.map(
    ({ packageName }) => packageName,
  );
  const referenceIds = projection.references
    .map(({ packageId }) => packageId)
    .sort(utf8Compare);
  if (projection.synchronizerId !== input.synchronizerId) {
    throw new Error("direct transfer package synchronizer does not match");
  }
  if (!exactStrings(projection.parties, expectedParties)) {
    throw new Error("direct transfer package parties do not match");
  }
  if (!exactStrings(referenceNames, REQUIRED_PACKAGE_NAMES)) {
    throw new Error("direct transfer package names do not match");
  }
  if (
    projection.packageIds.length === 0 ||
    new Set(projection.packageIds).size !== projection.packageIds.length ||
    !exactStrings(projection.packageIds, referenceIds)
  ) {
    throw new Error("direct transfer package IDs do not match");
  }
  const requestedAt = canonicalTime(
    input.probe.choiceArguments.transfer.requestedAt,
    "direct transfer requestedAt",
  );
  const executeBefore = canonicalTime(
    input.probe.choiceArguments.transfer.executeBefore,
    "direct transfer executeBefore",
  );
  const acquiredAt = canonicalTime(
    projection.acquiredAt,
    "direct transfer package acquiredAt",
  );
  const vettedAt = canonicalTime(
    projection.vettingValidAt,
    "direct transfer package vettingValidAt",
  );
  if (
    requestedAt > acquiredAt ||
    acquiredAt > vettedAt ||
    vettedAt > executeBefore
  ) {
    throw new Error("direct transfer package time scope does not match");
  }
  return Object.freeze([...projection.packageIds]) as readonly [
    string,
    ...string[],
  ];
}

export function validateDirectTransferExecutionMaterial(
  input: DirectTransferAuthorityControlInput,
) {
  const { choiceArguments, choiceArgumentsDigest } = input.probe;
  const payer = identifier(input.payerParty, "direct transfer payer Party");
  const agent = identifier(input.agentParty, "direct transfer agent Party");
  const synchronizerId = identifier(
    input.synchronizerId,
    "direct transfer synchronizer",
  );
  if (payer === agent)
    throw new Error("direct transfer payer and agent differ");
  if (
    choiceArguments.transfer.sender !== payer ||
    choiceArguments.expectedAdmin !==
      choiceArguments.transfer.instrumentId.admin ||
    choiceArguments.transfer.instrumentId.id !== "Amulet"
  ) {
    throw new Error("direct transfer authority or instrument does not match");
  }
  if (
    digestTransferFactoryChoiceArguments(choiceArguments) !==
      choiceArgumentsDigest ||
    input.factory.choiceArgumentsDigest !== choiceArgumentsDigest
  ) {
    throw new Error("direct transfer choice digest does not match");
  }
  const holdingIds = input.holdings.map(
    ({ disclosure }) => disclosure.contractId,
  );
  if (
    holdingIds.length === 0 ||
    !exactStrings(holdingIds, choiceArguments.transfer.inputHoldingCids) ||
    input.holdings.some(
      ({ disclosure }) => disclosure.synchronizerId !== synchronizerId,
    )
  ) {
    throw new Error("direct transfer holdings do not match");
  }
  const factoryId = identifier(
    input.factory.factoryId,
    "direct transfer factory ID",
  );
  const factoryMatches = input.factory.disclosedContracts.filter(
    (disclosure) => disclosure.contractId === factoryId,
  );
  if (
    input.factory.transferKind !== "direct" ||
    factoryMatches.length !== 1 ||
    factoryMatches[0]!.templateId !==
      FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID ||
    input.factory.disclosedContracts.some(
      ({ synchronizerId: candidate }) => candidate !== synchronizerId,
    )
  ) {
    throw new Error("direct transfer factory does not match");
  }
  return Object.freeze({ agent, factoryId, payer, synchronizerId });
}
