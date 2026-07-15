import type {
  CapabilityWalletApprovalRequest,
  CapabilityWalletConnector,
} from "@sotto/x402-canton";
import type {} from "@canton-network/core-provider-dapp";
import { openRpcObject } from "./openrpc-capability-wallet-jsonrpc.js";
import {
  callOpenRpcSdkProvider,
  OPENRPC_SDK_METHOD_NOT_FOUND,
  type OpenRpcSdkProvider,
} from "./openrpc-capability-wallet-provider.js";

export const OPENRPC_CAPABILITY_WALLET_VERSION =
  "sotto-openrpc-capability-wallet-v1" as const;
export const OPENRPC_CAPABILITIES_METHOD =
  "sotto_capabilityWallet_getCapabilities" as const;
export const OPENRPC_SIGN_PREPARED_METHOD =
  "sotto_capabilityWallet_signPreparedTransaction" as const;

type OpenRpcCapabilityWalletMethod =
  typeof OPENRPC_CAPABILITIES_METHOD | typeof OPENRPC_SIGN_PREPARED_METHOD;

export type OpenRpcCapabilityWalletRequest = Readonly<{
  method: OpenRpcCapabilityWalletMethod;
  params: Readonly<Record<string, unknown>>;
}>;

export type OpenRpcCapabilityWalletProvider =
  OpenRpcSdkProvider<OpenRpcCapabilityWalletRequest>;

export type CantonInjectedOpenRpcProvider = NonNullable<Window["canton"]>;

export function adaptCantonOpenRpcProvider(
  provider: Pick<CantonInjectedOpenRpcProvider, "request">,
): OpenRpcCapabilityWalletProvider {
  const request = provider.request.bind(
    provider,
  ) as unknown as OpenRpcCapabilityWalletProvider["request"];
  return Object.freeze({ request });
}

type OpenRpcCapabilityWalletInput = Readonly<{
  connectorId: string;
  expectedNetwork: `canton:${string}`;
  expectedOrigin: string;
  expectedPackageId: string;
  payerParty: string;
  provider: OpenRpcCapabilityWalletProvider;
}>;

function approvalParameters(request: CapabilityWalletApprovalRequest) {
  const { preparedTransaction, ...identity } = request;
  return Object.freeze({
    request: Object.freeze({
      ...structuredClone(identity),
      preparedTransaction: Buffer.from(preparedTransaction).toString("base64"),
    }),
    version: OPENRPC_CAPABILITY_WALLET_VERSION,
  });
}

function unsupportedCapabilities(
  connectorId: string,
  network: `canton:${string}`,
  origin: string,
  packageId: string,
  payerParty: string,
) {
  return Object.freeze({
    connectorId,
    connectorKind: "openrpc" as const,
    explicitApproval: true,
    hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2"]),
    networks: Object.freeze([network]),
    origin,
    packageIds: Object.freeze([packageId]),
    payerParty,
    preparedTransactionSigning: false,
    signatureFormats: Object.freeze(["SIGNATURE_FORMAT_CONCAT"]),
    signingAlgorithms: Object.freeze(["SIGNING_ALGORITHM_SPEC_ED25519"]),
    version: "sotto-capability-wallet-capabilities-v1" as const,
  });
}

export function createOpenRpcCapabilityWallet(
  input: OpenRpcCapabilityWalletInput,
): CapabilityWalletConnector {
  const provider = input.provider;
  const connectorId = input.connectorId;
  const expectedNetwork = input.expectedNetwork;
  const expectedOrigin = input.expectedOrigin;
  const expectedPackageId = input.expectedPackageId;
  const payerParty = input.payerParty;
  const call = (
    method: OpenRpcCapabilityWalletMethod,
    params: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ) => {
    const request: OpenRpcCapabilityWalletRequest = Object.freeze({
      method,
      params,
    });
    return callOpenRpcSdkProvider(provider, request, signal);
  };
  return Object.freeze({
    discover: async ({ signal }) => {
      const result = await call(
        OPENRPC_CAPABILITIES_METHOD,
        Object.freeze({
          connectorId,
          origin: expectedOrigin,
          payerParty,
          version: OPENRPC_CAPABILITY_WALLET_VERSION,
        }),
        signal,
      );
      if (result === OPENRPC_SDK_METHOD_NOT_FOUND) {
        return unsupportedCapabilities(
          connectorId,
          expectedNetwork,
          expectedOrigin,
          expectedPackageId,
          payerParty,
        );
      }
      const capabilities = openRpcObject(result, "OpenRPC wallet capabilities");
      if (
        capabilities.connectorId !== connectorId ||
        capabilities.origin !== expectedOrigin ||
        capabilities.payerParty !== payerParty
      ) {
        throw new Error("OpenRPC wallet capability identity is invalid");
      }
      return result;
    },
    requestApproval: async (request, { signal }) => {
      const result = await call(
        OPENRPC_SIGN_PREPARED_METHOD,
        approvalParameters(request),
        signal,
      );
      if (result === OPENRPC_SDK_METHOD_NOT_FOUND) {
        throw new Error("OpenRPC prepared-signing method is unsupported");
      }
      return result;
    },
  });
}
