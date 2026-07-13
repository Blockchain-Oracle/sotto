import type { StrictJsonObject } from "./strict-json-value.js";
import type { ValidatedDisclosedContract } from "./purchase-holding-types.js";

export const TRANSFER_FACTORY_REGISTRY_PATH =
  "/registry/transfer-instruction/v1/transfer-factory" as const;
export const MAX_REGISTRY_RESPONSE_BYTES = 2_000_000;
export const MAX_REGISTRY_CONTEXT_BYTES = 65_536;
export const MAX_REGISTRY_DISCLOSURES = 16;
export const MAX_REGISTRY_DISCLOSURE_BLOB_BYTES = 262_144;
export const MAX_TOTAL_REGISTRY_DISCLOSURE_BYTES = 1_048_576;
export const REGISTRY_TIMEOUT_MS = 10_000;

export type TransferFactoryRegistryRequest = Readonly<{
  registryAdmin: string;
  path: typeof TRANSFER_FACTORY_REGISTRY_PATH;
  method: "POST";
  contentType: "application/json";
  redirect: "error";
  timeoutMilliseconds: typeof REGISTRY_TIMEOUT_MS;
  maximumResponseBytes: typeof MAX_REGISTRY_RESPONSE_BYTES;
  body: string;
}>;

export type TransferFactoryRegistryReader = (
  request: TransferFactoryRegistryRequest,
) => Promise<Uint8Array>;

export type TransferFactoryExecutionMaterial = Readonly<{
  factoryId: string;
  transferKind: "direct";
  choiceArgumentsDigest: `sha256:${string}`;
  choiceContextData: StrictJsonObject;
  disclosedContracts: readonly ValidatedDisclosedContract[];
}>;
