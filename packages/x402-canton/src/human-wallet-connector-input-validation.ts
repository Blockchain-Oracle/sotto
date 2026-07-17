import type {
  HumanWalletConnector,
  HumanWalletConnectorKind,
  HumanWalletConnectorPreflightInput,
} from "./human-wallet-connector-types.js";
import {
  humanWalletConnectorKind,
  humanWalletConnectorOrigin,
  humanWalletPackageId,
} from "./human-wallet-connector-validation-primitives.js";
import { identifier } from "./purchase-commitment-primitives.js";

export type ValidatedHumanWalletConnectorPreflightInput = Readonly<{
  connector: HumanWalletConnector;
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  connectorOrigin: string;
  expectedPackageId: string;
  observePayerIdentity: HumanWalletConnectorPreflightInput["observePayerIdentity"];
}>;

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    JSON.stringify([...ownKeys].sort()) !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys must match the approved contract`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must use own data properties`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

export function validateHumanWalletConnectorPreflightInput(
  value: HumanWalletConnectorPreflightInput,
): ValidatedHumanWalletConnectorPreflightInput {
  const input = exactDataRecord(
    value,
    [
      "connector",
      "connectorId",
      "connectorKind",
      "connectorOrigin",
      "expectedPackageId",
      "observePayerIdentity",
    ],
    "human wallet connector preflight input",
  );
  const source = input.connector;
  const connector = exactDataRecord(
    source,
    ["discover", "requestApproval"],
    "human wallet connector",
  );
  const discover = connector.discover;
  const requestApproval = connector.requestApproval;
  const observePayerIdentity = input.observePayerIdentity;
  if (
    typeof discover !== "function" ||
    typeof requestApproval !== "function" ||
    typeof observePayerIdentity !== "function"
  ) {
    throw new Error("human wallet connector functions are required");
  }
  const connectorTarget = source as object;
  const inputTarget = value as object;
  return Object.freeze({
    connector: Object.freeze({
      discover: (options: Parameters<HumanWalletConnector["discover"]>[0]) =>
        Reflect.apply(discover, connectorTarget, [options]) as Promise<unknown>,
      requestApproval: (
        request: unknown,
        options: Parameters<HumanWalletConnector["requestApproval"]>[1],
      ) =>
        Reflect.apply(requestApproval, connectorTarget, [
          request,
          options,
        ]) as Promise<unknown>,
    }),
    connectorId: identifier(
      input.connectorId,
      "human wallet connector ID",
      128,
    ),
    connectorKind: humanWalletConnectorKind(input.connectorKind),
    connectorOrigin: humanWalletConnectorOrigin(input.connectorOrigin),
    expectedPackageId: humanWalletPackageId(input.expectedPackageId),
    observePayerIdentity: (options) =>
      Reflect.apply(observePayerIdentity, inputTarget, [options]) as ReturnType<
        HumanWalletConnectorPreflightInput["observePayerIdentity"]
      >,
  });
}
