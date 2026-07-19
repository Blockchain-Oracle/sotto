import type { Create } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  validateHumanPreparedContextInputs,
  type HumanPreparedContextInputs,
} from "./human-prepared-purchase-context-inputs.js";
import { preparedIdentifier } from "./prepared-purchase-effect-values.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import { preparedTransferContextIds } from "./prepared-transfer-context-ids.js";

export type HumanPreparedPurchaseInputEffects = HumanPreparedContextInputs &
  Readonly<{ holdings: ReadonlyMap<string, Create> }>;

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function exactIds(
  actual: readonly string[],
  expected: readonly string[],
): void {
  const canonical = (values: readonly string[]) =>
    [...values].sort(utf8Compare);
  if (
    new Set(actual).size !== actual.length ||
    new Set(expected).size !== expected.length ||
    JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))
  ) {
    throw new Error("prepared human metadata input effects do not match");
  }
}

function validateDisclosures(
  metadata: PreparedPurchaseMetadata,
  request: HumanPurchasePrepareRequest,
): void {
  const disclosures = new Map(
    request.disclosedContracts.map((value) => [value.contractId, value]),
  );
  if (disclosures.size !== request.disclosedContracts.length) {
    throw new Error("prepared human disclosed metadata inputs repeat");
  }
  for (const [contractId, disclosure] of disclosures) {
    const input = metadata.inputContracts.get(contractId);
    if (input === undefined) continue;
    const eventBlob = metadata.inputEventBlobs.get(contractId);
    if (
      eventBlob === undefined ||
      !Buffer.from(eventBlob).equals(
        Buffer.from(disclosure.createdEventBlob, "base64"),
      )
    ) {
      throw new Error("prepared human disclosed metadata input does not match");
    }
    preparedIdentifier(
      input.templateId,
      disclosure.templateId,
      "human disclosed metadata input template",
    );
  }
}

export function validateHumanPreparedPurchaseInputEffects(
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  request: HumanPurchasePrepareRequest,
): HumanPreparedPurchaseInputEffects {
  const root = request.commands[0].ExerciseCommand.choiceArgument;
  const holdingIds = root.transfer.inputHoldingCids;
  const contextIds = preparedTransferContextIds(root.extraArgs.context);
  const contextInputs = [
    contextIds.get("transfer-preapproval"),
    contextIds.get("external-party-config-state"),
    contextIds.get("featured-app-right"),
  ];
  if (contextInputs.some((value) => value === undefined)) {
    throw new Error("prepared human transfer context inputs are absent");
  }
  const expectedIds = [
    intent.tokenFactory.contractId,
    ...holdingIds,
    ...(contextInputs as string[]),
  ];
  exactIds([...metadata.inputContracts.keys()], [...new Set(expectedIds)]);
  for (const required of [...holdingIds, ...(contextInputs as string[])]) {
    if (!metadata.inputContracts.has(required)) {
      throw new Error("prepared human required metadata input is absent");
    }
  }
  validateDisclosures(metadata, request);
  const context = validateHumanPreparedContextInputs(
    metadata.inputContracts,
    contextIds,
    intent,
    request,
  );
  return Object.freeze({
    ...context,
    holdings: new Map(
      holdingIds.map((contractId) => [
        contractId,
        metadata.inputContracts.get(contractId)!,
      ]),
    ),
  });
}
