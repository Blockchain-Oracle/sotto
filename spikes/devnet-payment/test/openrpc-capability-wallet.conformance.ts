import type {
  CapabilityWalletApprovalRequest,
  CapabilityWalletConnector,
} from "../../../packages/x402-canton/src/index.js";
import type {
  CapabilityWalletConnectorContractHarness,
  CapabilityWalletContractScenarioOptions,
} from "../../../packages/x402-canton/test/capability-wallet-connector-contract-support.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_CAPABILITIES,
  verifiedCapabilityBootstrap,
} from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import {
  adaptCantonOpenRpcProvider,
  createOpenRpcCapabilityWallet,
  OPENRPC_CAPABILITIES_METHOD,
  type OpenRpcCapabilityWalletRequest,
} from "../src/openrpc-capability-wallet.js";

export const OPENRPC_CONNECTOR_ID = "test-openrpc-wallet";
export const OPENRPC_CONNECTOR_ORIGIN = "chrome-extension://test-wallet";
export const OPENRPC_NETWORK = CONNECTOR_CAPABILITIES.networks[0]!;
export const OPENRPC_PACKAGE_ID = CONNECTOR_CAPABILITIES.packageIds[0]!;

export const OPENRPC_CAPABILITIES = Object.freeze({
  ...CONNECTOR_CAPABILITIES,
  connectorId: OPENRPC_CONNECTOR_ID,
  connectorKind: "openrpc" as const,
  origin: OPENRPC_CONNECTOR_ORIGIN,
});

function approvalRequest(value: unknown): CapabilityWalletApprovalRequest {
  const record = value as Record<string, unknown>;
  return {
    ...(record as Omit<CapabilityWalletApprovalRequest, "preparedTransaction">),
    preparedTransaction: new Uint8Array(
      Buffer.from(record.preparedTransaction as string, "base64"),
    ),
  };
}

function waitForRelease(
  setRelease: (release: () => void) => void,
): Promise<void> {
  return new Promise((resolve) => {
    setRelease(resolve);
  });
}

function scenario(options: CapabilityWalletContractScenarioOptions = {}) {
  let approvalAborted = false;
  let approvalStarted = false;
  let discoveryAborted = false;
  let discoveryStarted = false;
  let presented: CapabilityWalletApprovalRequest | undefined;
  let beforeMutation: Uint8Array | undefined;
  let releaseApproval: () => void = () => undefined;
  let releaseDiscovery: () => void = () => undefined;
  let signs = 0;
  const provider = {
    origin: OPENRPC_CONNECTOR_ORIGIN,
    request: async (request: OpenRpcCapabilityWalletRequest) => {
      if (request.method === OPENRPC_CAPABILITIES_METHOD) {
        discoveryStarted = true;
        if (options.discovery === "hang") {
          await waitForRelease((release) => (releaseDiscovery = release));
        }
        const result =
          options.discovery === "changed-origin"
            ? { ...OPENRPC_CAPABILITIES, origin: "wallet://changed" }
            : options.discovery === "unsupported"
              ? { ...OPENRPC_CAPABILITIES, packageIds: [] }
              : OPENRPC_CAPABILITIES;
        return result;
      }
      approvalStarted = true;
      const payload = request.params.request;
      presented = approvalRequest(payload);
      beforeMutation = new Uint8Array(presented.preparedTransaction);
      if (options.approval === "mutate") {
        presented.preparedTransaction[0] =
          (presented.preparedTransaction[0] ?? 0) ^ 0xff;
      }
      if (options.approval === "hang") {
        await waitForRelease((release) => (releaseApproval = release));
      }
      const result =
        options.approval === "reject"
          ? { outcome: "rejected", reason: "user-rejected" }
          : options.approval === "malformed"
            ? { outcome: "approved", signature: {} }
            : APPROVED_SIGNATURE;
      return result;
    },
  };
  const base = createOpenRpcCapabilityWallet({
    connectorId: OPENRPC_CONNECTOR_ID,
    expectedNetwork: OPENRPC_NETWORK,
    expectedOrigin: OPENRPC_CONNECTOR_ORIGIN,
    expectedPackageId: OPENRPC_PACKAGE_ID,
    payerParty: OPENRPC_CAPABILITIES.payerParty,
    provider: adaptCantonOpenRpcProvider(provider as never),
  });
  const connector: CapabilityWalletConnector = {
    discover: ({ signal }) => {
      signal.addEventListener("abort", () => (discoveryAborted = true), {
        once: true,
      });
      return base.discover({ signal });
    },
    requestApproval: async (request, { signal }) => {
      signal.addEventListener("abort", () => (approvalAborted = true), {
        once: true,
      });
      const result = await base.requestApproval(request, { signal });
      if (result === APPROVED_SIGNATURE) signs += 1;
      return result;
    },
  };
  return {
    connector,
    probe: {
      approvalAborted: () => approvalAborted,
      approvalStarted: () => approvalStarted,
      discoveryAborted: () => discoveryAborted,
      discoveryStarted: () => discoveryStarted,
      presentedRequest: () => presented,
      releaseApproval: () => releaseApproval(),
      releaseDiscovery: () => releaseDiscovery(),
      requestBytesBeforeMutation: () => beforeMutation,
      signCalls: () => signs,
    },
  };
}

export const openRpcConnectorHarness: CapabilityWalletConnectorContractHarness =
  {
    connectorId: OPENRPC_CONNECTOR_ID,
    connectorKind: "openrpc",
    connectorOrigin: OPENRPC_CONNECTOR_ORIGIN,
    createPrepared: verifiedCapabilityBootstrap,
    createScenario: scenario,
    label: "OpenRPC capability wallet",
  };
