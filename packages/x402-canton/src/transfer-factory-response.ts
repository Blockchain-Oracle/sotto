import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import { canonicalDisclosureBlob } from "./purchase-disclosure-validation.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { assertStrictJson } from "./strict-json.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";
import {
  MAX_REGISTRY_CONTEXT_BYTES,
  MAX_REGISTRY_DISCLOSURES,
  MAX_REGISTRY_DISCLOSURE_BLOB_BYTES,
  MAX_REGISTRY_RESPONSE_BYTES,
  MAX_TOTAL_REGISTRY_DISCLOSURE_BYTES,
  type TransferFactoryExecutionMaterial,
} from "./transfer-factory-types.js";

export type TransferFactoryResponseExpectation = Readonly<{
  choiceArgumentsDigest: `sha256:${string}`;
  expectedFactoryId?: string;
  implementationTemplateId: string;
  requireFactoryDisclosure: boolean;
  synchronizerId: string;
}>;

/** @internal Shared by pinned purchase and bootstrap discovery parsers. */
export function parseTransferFactoryResponseWithExpectation(
  bytes: Uint8Array,
  expectation: TransferFactoryResponseExpectation,
): TransferFactoryExecutionMaterial {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > MAX_REGISTRY_RESPONSE_BYTES
  ) {
    throw new Error("TransferFactory response exceeds byte limit");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("TransferFactory response must not contain a BOM");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("TransferFactory response is not valid UTF-8");
  }
  assertStrictJson(source, 16, 2_048);
  const root = objectValue(JSON.parse(source), "TransferFactory response");
  exactKeys(
    root,
    ["factoryId", "transferKind", "choiceContext"],
    "TransferFactory response",
  );
  const factoryId = identifier(root.factoryId, "TransferFactory factoryId");
  if (
    expectation.expectedFactoryId !== undefined &&
    factoryId !== expectation.expectedFactoryId
  ) {
    throw new Error("TransferFactory factoryId does not match the purchase");
  }
  if (root.transferKind !== "direct") {
    throw new Error("TransferFactory transferKind must be direct");
  }
  const context = objectValue(
    root.choiceContext,
    "TransferFactory choiceContext",
  );
  exactKeys(
    context,
    ["choiceContextData", "disclosedContracts"],
    "TransferFactory choiceContext",
  );
  const contextData = objectValue(
    context.choiceContextData,
    "TransferFactory choiceContextData",
  );
  exactKeys(contextData, ["values"], "TransferFactory choiceContextData");
  objectValue(contextData.values, "TransferFactory choiceContextData values");
  const choiceContextData = snapshotStrictJsonObject(
    contextData,
    "TransferFactory choiceContextData",
    {
      maximumBytes: MAX_REGISTRY_CONTEXT_BYTES,
      maximumDepth: 16,
      maximumNodes: 2_048,
    },
  );
  if (
    !Array.isArray(context.disclosedContracts) ||
    context.disclosedContracts.length > MAX_REGISTRY_DISCLOSURES
  ) {
    throw new Error("TransferFactory disclosures exceed count limit");
  }
  let totalBlobBytes = 0;
  const disclosedContracts = context.disclosedContracts.map((candidate) => {
    const disclosure = objectValue(candidate, "TransferFactory disclosure");
    exactKeys(
      disclosure,
      ["templateId", "contractId", "createdEventBlob", "synchronizerId"],
      "TransferFactory disclosure",
    );
    const templateId = identifier(
      disclosure.templateId,
      "TransferFactory disclosure templateId",
    );
    if (!/^[a-f0-9]{64}:[^:\s]+:[^:\s]+$/.test(templateId)) {
      throw new Error("TransferFactory disclosure templateId is invalid");
    }
    const contractId = identifier(
      disclosure.contractId,
      "TransferFactory disclosure contractId",
    );
    const synchronizerId = identifier(
      disclosure.synchronizerId,
      "TransferFactory disclosure synchronizerId",
    );
    if (synchronizerId !== expectation.synchronizerId) {
      throw new Error("TransferFactory disclosure synchronizer does not match");
    }
    if (
      contractId === factoryId &&
      templateId !== expectation.implementationTemplateId
    ) {
      throw new Error("TransferFactory implementation template does not match");
    }
    const blob = canonicalDisclosureBlob(
      disclosure.createdEventBlob,
      "TransferFactory disclosure createdEventBlob",
      MAX_REGISTRY_DISCLOSURE_BLOB_BYTES,
    );
    totalBlobBytes += blob.bytes;
    return Object.freeze({
      templateId,
      contractId,
      createdEventBlob: blob.value,
      synchronizerId,
    });
  });
  if (
    new Set(disclosedContracts.map(({ contractId }) => contractId)).size !==
    disclosedContracts.length
  ) {
    throw new Error("TransferFactory disclosure contractId is duplicated");
  }
  if (
    expectation.requireFactoryDisclosure &&
    disclosedContracts.filter(({ contractId }) => contractId === factoryId)
      .length !== 1
  ) {
    throw new Error(
      "TransferFactory bootstrap requires exactly one matching disclosure",
    );
  }
  if (totalBlobBytes > MAX_TOTAL_REGISTRY_DISCLOSURE_BYTES) {
    throw new Error("TransferFactory disclosures exceed total byte limit");
  }
  return Object.freeze({
    factoryId,
    transferKind: "direct",
    choiceArgumentsDigest: expectation.choiceArgumentsDigest,
    choiceContextData,
    disclosedContracts: Object.freeze(disclosedContracts),
  });
}

export function parseTransferFactoryResponse(
  bytes: Uint8Array,
  intent: BoundedPurchaseLedgerIntent,
  choiceArgumentsDigest: `sha256:${string}`,
): TransferFactoryExecutionMaterial {
  return parseTransferFactoryResponseWithExpectation(bytes, {
    choiceArgumentsDigest,
    expectedFactoryId: intent.tokenFactory.contractId,
    implementationTemplateId: intent.tokenFactory.implementationTemplateId,
    requireFactoryDisclosure: false,
    synchronizerId: intent.challenge.synchronizerId,
  });
}
