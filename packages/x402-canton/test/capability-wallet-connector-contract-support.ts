import { vi } from "vitest";
import {
  projectPreparedCapabilityBootstrapApproval,
  type CapabilityWalletApprovalRequest,
  type CapabilityWalletConnector,
  type CapabilityWalletConnectorKind,
  type CapabilityWalletSigningSessionInput,
  type HashVerifiedPreparedCapabilityBootstrap,
} from "../src/index.js";

export type CapabilityWalletContractScenarioOptions = Readonly<{
  approval?: "approve" | "hang" | "malformed" | "mutate" | "reject";
  discovery?: "changed-origin" | "hang" | "supported" | "unsupported";
}>;

export type CapabilityWalletContractProbe = Readonly<{
  approvalAborted: () => boolean;
  approvalStarted: () => boolean;
  discoveryAborted: () => boolean;
  discoveryStarted: () => boolean;
  presentedRequest: () => CapabilityWalletApprovalRequest | undefined;
  releaseApproval: () => void;
  releaseDiscovery: () => void;
  requestBytesBeforeMutation: () => Uint8Array | undefined;
  signCalls: () => number;
}>;

export type CapabilityWalletConnectorContractHarness = Readonly<{
  connectorId: string;
  connectorKind: CapabilityWalletConnectorKind;
  connectorOrigin: string;
  createPrepared: () => Promise<HashVerifiedPreparedCapabilityBootstrap>;
  createScenario: (
    options?: CapabilityWalletContractScenarioOptions,
  ) => Readonly<{
    connector: CapabilityWalletConnector;
    probe: CapabilityWalletContractProbe;
  }>;
  label: string;
}>;

export const CAPABILITY_WALLET_CONTRACT_NOW = Date.parse(
  "2026-07-15T10:00:00.000Z",
);

export function recordingContractConnector(
  connector: CapabilityWalletConnector,
) {
  const discover = vi.fn(connector.discover.bind(connector));
  const requestApproval = vi.fn(connector.requestApproval.bind(connector));
  return {
    connector: { discover, requestApproval },
    discover,
    requestApproval,
  };
}

export function capabilityWalletContractSessionInput(
  harness: CapabilityWalletConnectorContractHarness,
  connector: CapabilityWalletConnector,
  prepared: HashVerifiedPreparedCapabilityBootstrap,
  timeoutMilliseconds = 1_000,
  signal?: AbortSignal,
): CapabilityWalletSigningSessionInput {
  return {
    connector,
    connectorId: harness.connectorId,
    connectorOrigin: harness.connectorOrigin,
    prepared,
    timeoutMilliseconds,
    ...(signal === undefined ? {} : { signal }),
  };
}

export function expectedCapabilityWalletContractApproval(
  prepared: HashVerifiedPreparedCapabilityBootstrap,
) {
  return projectPreparedCapabilityBootstrapApproval(prepared);
}
