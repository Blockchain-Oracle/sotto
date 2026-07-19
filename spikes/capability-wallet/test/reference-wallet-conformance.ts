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
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
} from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import { createReferenceWalletConnector } from "../src/reference-wallet.js";
import { referenceWalletResponsePayload } from "../src/reference-wallet-request.js";
import type { ReferenceWalletRequestPayload } from "../src/reference-wallet-types.js";
import type {
  WalletHandoffRecord,
  WalletHandoffStorage,
} from "../src/wallet-handoff-storage.js";
import { walletSdkVerifiedCapabilityBootstrap } from "./reference-wallet.fixtures.js";

function memoryStorage() {
  const records = new Map<string, WalletHandoffRecord>();
  const key = (id: string, kind: string) => `${id}:${kind}`;
  const storage: WalletHandoffStorage = {
    claim: async (id, kind) => {
      const record = records.get(key(id, kind));
      if (record === undefined) throw new Error("test handoff is absent");
      return record as Awaited<ReturnType<WalletHandoffStorage["claim"]>>;
    },
    cleanupExpired: async () => [],
    create: async (input) => {
      records.set(key(input.id, input.kind), {
        ...input,
        version: "sotto-wallet-handoff-v1",
      });
    },
    read: async (id, kind) => {
      const record = records.get(key(id, kind));
      if (record === undefined) throw new Error("test handoff is absent");
      return record as Awaited<ReturnType<WalletHandoffStorage["read"]>>;
    },
  };
  return { read: storage.read, storage };
}

function approvalRequest(payload: unknown): CapabilityWalletApprovalRequest {
  const request = (payload as ReferenceWalletRequestPayload).request;
  return {
    ...request,
    preparedTransaction: new Uint8Array(
      Buffer.from(request.preparedTransaction, "base64"),
    ),
  };
}

function waitForRelease(
  signal: AbortSignal,
  markAborted: () => void,
  setRelease: (release: () => void) => void,
): Promise<void> {
  return new Promise((resolve) => {
    setRelease(resolve);
    signal.addEventListener("abort", markAborted, { once: true });
  });
}

function scenario(options: CapabilityWalletContractScenarioOptions = {}) {
  const memory = memoryStorage();
  let approvalAborted = false;
  let approvalStarted = false;
  let discoveryAborted = false;
  let discoveryStarted = false;
  let presented: CapabilityWalletApprovalRequest | undefined;
  let beforeMutation: Uint8Array | undefined;
  let releaseApproval: () => void = () => undefined;
  let releaseDiscovery: () => void = () => undefined;
  let signs = 0;
  const base = createReferenceWalletConnector({
    capabilities: CONNECTOR_CAPABILITIES,
    exchange: async (id, { signal }) => {
      const requestRecord = await memory.read(id, "request");
      presented = approvalRequest(requestRecord.payload);
      beforeMutation = new Uint8Array(presented.preparedTransaction);
      if (options.approval === "mutate") {
        presented.preparedTransaction[0] =
          (presented.preparedTransaction[0] ?? 0) ^ 0xff;
      }
      if (options.approval === "hang") {
        await waitForRelease(
          signal,
          () => (approvalAborted = true),
          (release) => (releaseApproval = release),
        );
      }
      if (signal.aborted) {
        throw new Error("reference wallet exchange was cancelled");
      }
      const response =
        options.approval === "reject"
          ? { outcome: "rejected" as const, reason: "user-rejected" as const }
          : options.approval === "malformed"
            ? ({ outcome: "approved", signature: {} } as never)
            : APPROVED_SIGNATURE;
      if (response === APPROVED_SIGNATURE) signs += 1;
      await memory.storage.create({
        expiresAt: requestRecord.expiresAt,
        id,
        kind: "response",
        payload: referenceWalletResponsePayload(
          presented.sessionId,
          response as never,
        ),
      });
    },
    storage: memory.storage,
  });
  const connector: CapabilityWalletConnector = {
    discover: async ({ signal }) => {
      discoveryStarted = true;
      if (options.discovery === "hang") {
        await waitForRelease(
          signal,
          () => (discoveryAborted = true),
          (release) => (releaseDiscovery = release),
        );
      }
      if (options.discovery === "changed-origin") {
        return { ...CONNECTOR_CAPABILITIES, origin: "wallet://changed" };
      }
      if (options.discovery === "unsupported") {
        return { ...CONNECTOR_CAPABILITIES, packageIds: [] };
      }
      return base.discover({ signal });
    },
    requestApproval: async (request, options) => {
      approvalStarted = true;
      options.signal.addEventListener("abort", () => (approvalAborted = true), {
        once: true,
      });
      return base.requestApproval(request, options);
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

export const referenceWalletConnectorHarness: CapabilityWalletConnectorContractHarness =
  {
    connectorId: CONNECTOR_ID,
    connectorKind: "wallet-sdk",
    connectorOrigin: CONNECTOR_ORIGIN,
    createPrepared: walletSdkVerifiedCapabilityBootstrap,
    createScenario: scenario,
    label: "Wallet SDK reference connector",
  };
