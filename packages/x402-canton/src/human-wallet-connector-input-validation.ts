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
import { exactWalletDataRecord } from "./wallet-data-record.js";

export type ValidatedHumanWalletConnectorPreflightInput = Readonly<{
  connector: HumanWalletConnector;
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  connectorOrigin: string;
  expectedPackageId: string;
  observePayerIdentity: HumanWalletConnectorPreflightInput["observePayerIdentity"];
}>;

export function validateHumanWalletConnectorPreflightInput(
  value: HumanWalletConnectorPreflightInput,
): ValidatedHumanWalletConnectorPreflightInput {
  const input = exactWalletDataRecord(
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
  const connector = exactWalletDataRecord(
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
