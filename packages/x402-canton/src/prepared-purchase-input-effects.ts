import type { Create } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { validatePreparedSourceCapability } from "./prepared-purchase-capability-effect.js";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

function exactIds(
  actual: readonly string[],
  expected: readonly string[],
): void {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error("prepared metadata input effects do not match");
  }
}

function validateFactoryInput(
  create: Create,
  intent: BoundedPurchaseLedgerIntent,
): void {
  preparedIdentifier(
    create.templateId,
    intent.tokenFactory.creationTemplateId,
    "metadata TransferFactory template",
  );
  if (create.packageName !== "splice-amulet") {
    throw new Error("prepared metadata TransferFactory package does not match");
  }
  preparedParties(
    create.signatories,
    [intent.tokenFactory.expectedAdmin],
    "metadata TransferFactory signatory",
  );
  preparedParties(
    create.stakeholders,
    [intent.tokenFactory.expectedAdmin],
    "metadata TransferFactory stakeholder",
  );
}

export function validatePreparedPurchaseInputEffects(
  metadata: PreparedPurchaseMetadata,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): ReadonlyMap<string, Create> {
  const holdingIds =
    request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids;
  exactIds(
    [...metadata.inputContracts.keys()],
    [
      intent.capability.contractId,
      intent.tokenFactory.contractId,
      ...holdingIds,
    ],
  );
  const capability = metadata.inputContracts.get(intent.capability.contractId);
  const factory = metadata.inputContracts.get(intent.tokenFactory.contractId);
  if (capability === undefined || factory === undefined) {
    throw new Error("prepared metadata authority inputs are absent");
  }
  validatePreparedSourceCapability(capability, intent);
  validateFactoryInput(factory, intent);
  return new Map(
    holdingIds.map((contractId) => [
      contractId,
      metadata.inputContracts.get(contractId)!,
    ]),
  );
}
