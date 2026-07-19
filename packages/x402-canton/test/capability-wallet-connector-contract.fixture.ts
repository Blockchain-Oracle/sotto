import type { CapabilityWalletConnector } from "../src/index.js";
import type {
  CapabilityWalletConnectorContractHarness,
  CapabilityWalletContractScenarioOptions,
} from "./capability-wallet-connector-contract-support.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_CAPABILITIES,
} from "./capability-wallet-connector.fixtures.js";

export function createRecordingWalletContractScenario(
  options: CapabilityWalletContractScenarioOptions = {},
): ReturnType<CapabilityWalletConnectorContractHarness["createScenario"]> {
  let approvalAborted = false;
  let approvalStarted = false;
  let discoveryAborted = false;
  let discoveryStarted = false;
  let presentedRequest:
    Parameters<CapabilityWalletConnector["requestApproval"]>[0] | undefined;
  let releaseApproval: () => void = () => undefined;
  let releaseDiscovery: () => void = () => undefined;
  let requestBytes: Uint8Array | undefined;
  let signatures = 0;
  const rejected = { outcome: "rejected", reason: "user-rejected" } as const;

  const observeAbort = (signal: AbortSignal, mark: () => void): void => {
    if (signal.aborted) mark();
    else signal.addEventListener("abort", mark, { once: true });
  };
  const connector: CapabilityWalletConnector = {
    discover: async ({ signal }) => {
      discoveryStarted = true;
      observeAbort(signal, () => (discoveryAborted = true));
      switch (options.discovery) {
        case "changed-origin":
          return { ...CONNECTOR_CAPABILITIES, origin: "wallet://attacker" };
        case "unsupported":
          return { ...CONNECTOR_CAPABILITIES, networks: [] };
        case "hang":
          return new Promise((resolve) => {
            releaseDiscovery = () => resolve(CONNECTOR_CAPABILITIES);
          });
        default:
          return CONNECTOR_CAPABILITIES;
      }
    },
    requestApproval: async (request, { signal }) => {
      approvalStarted = true;
      presentedRequest = request;
      observeAbort(signal, () => (approvalAborted = true));
      switch (options.approval) {
        case "reject":
          return rejected;
        case "malformed":
          return { outcome: "approved" };
        case "mutate":
          requestBytes = new Uint8Array(request.preparedTransaction);
          request.preparedTransaction[0] =
            (request.preparedTransaction[0] ?? 0) ^ 0xff;
          signatures += 1;
          return APPROVED_SIGNATURE;
        case "hang":
          return new Promise((resolve) => {
            releaseApproval = () => {
              if (signal.aborted) resolve(rejected);
              else {
                signatures += 1;
                resolve(APPROVED_SIGNATURE);
              }
            };
          });
        default:
          signatures += 1;
          return APPROVED_SIGNATURE;
      }
    },
  };
  return {
    connector,
    probe: Object.freeze({
      approvalAborted: () => approvalAborted,
      approvalStarted: () => approvalStarted,
      discoveryAborted: () => discoveryAborted,
      discoveryStarted: () => discoveryStarted,
      presentedRequest: () => presentedRequest,
      releaseApproval: () => releaseApproval(),
      releaseDiscovery: () => releaseDiscovery(),
      requestBytesBeforeMutation: () =>
        requestBytes === undefined ? undefined : new Uint8Array(requestBytes),
      signCalls: () => signatures,
    }),
  };
}
