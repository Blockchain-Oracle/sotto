import type { Create } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { validatePreparedSourceCapability } from "./prepared-purchase-capability-effect.js";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

function validateInputIds(
  actual: readonly string[],
  allowed: ReadonlySet<string>,
  required: readonly string[],
): void {
  const actualSet = new Set(actual);
  if (
    actualSet.size !== actual.length ||
    actual.some((value) => !allowed.has(value)) ||
    required.some((value) => !actualSet.has(value))
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

function validateDisclosedInputs(
  metadata: PreparedPurchaseMetadata,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): void {
  const disclosures = new Map(
    request.disclosedContracts.map((value) => [value.contractId, value]),
  );
  if (disclosures.size !== request.disclosedContracts.length) {
    throw new Error("prepared disclosed metadata input effects repeat");
  }
  for (const [contractId, input] of metadata.inputContracts) {
    if (contractId === intent.capability.contractId) continue;
    const disclosure = disclosures.get(contractId);
    const eventBlob = metadata.inputEventBlobs.get(contractId);
    if (
      disclosure === undefined ||
      eventBlob === undefined ||
      !Buffer.from(eventBlob).equals(
        Buffer.from(disclosure.createdEventBlob, "base64"),
      )
    ) {
      throw new Error(
        "prepared disclosed metadata input effect does not match",
      );
    }
    preparedIdentifier(
      input.templateId,
      disclosure.templateId,
      "disclosed metadata input template",
    );
  }
}

export function validatePreparedPurchaseInputEffects(
  metadata: PreparedPurchaseMetadata,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
): ReadonlyMap<string, Create> {
  const holdingIds =
    request.commands[0]!.ExerciseCommand.choiceArgument.inputHoldingCids;
  const expectedIds = new Set([
    intent.capability.contractId,
    intent.tokenFactory.contractId,
    ...request.disclosedContracts.map(({ contractId }) => contractId),
  ]);
  validateInputIds([...metadata.inputContracts.keys()], expectedIds, [
    intent.capability.contractId,
    intent.tokenFactory.contractId,
    ...holdingIds,
  ]);
  const capability = metadata.inputContracts.get(intent.capability.contractId);
  const factory = metadata.inputContracts.get(intent.tokenFactory.contractId);
  if (capability === undefined || factory === undefined) {
    throw new Error("prepared metadata authority inputs are absent");
  }
  validatePreparedSourceCapability(capability, intent);
  validateFactoryInput(factory, intent);
  validateDisclosedInputs(metadata, intent, request);
  return new Map(
    holdingIds.map((contractId) => [
      contractId,
      metadata.inputContracts.get(contractId)!,
    ]),
  );
}
