import type { HumanObservationReadOptions } from "./human-observation-deadline.js";
import type { StrictJsonObject } from "./strict-json-value.js";
import type {
  MAX_REGISTRY_RESPONSE_BYTES,
  REGISTRY_TIMEOUT_MS,
  TRANSFER_FACTORY_REGISTRY_PATH,
} from "./transfer-factory-types.js";
import type { ValidatedDisclosedContract } from "./purchase-holding-types.js";

export type HumanTransferFactoryRegistryRequest = Readonly<{
  registryAdmin: string;
  path: typeof TRANSFER_FACTORY_REGISTRY_PATH;
  method: "POST";
  contentType: "application/json";
  redirect: "error";
  timeoutMilliseconds: typeof REGISTRY_TIMEOUT_MS;
  maximumResponseBytes: typeof MAX_REGISTRY_RESPONSE_BYTES;
  body: string;
}>;

export type HumanTransferFactoryRegistryReader = (
  request: HumanTransferFactoryRegistryRequest,
  options: HumanObservationReadOptions,
) => Promise<Uint8Array>;

export type HumanTransferFactoryObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
}>;

export type HumanTransferFactoryExecutionMaterial = Readonly<{
  factoryId: string;
  transferKind: "direct";
  choiceArgumentsDigest: `sha256:${string}`;
  choiceContextData: StrictJsonObject;
  disclosedContracts: readonly ValidatedDisclosedContract[];
}>;
