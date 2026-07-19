import type {
  HumanWalletApprovalRequest,
  HumanWalletCapabilities,
} from "@sotto/x402-canton";
import {
  REFERENCE_HUMAN_WALLET_CONNECTOR_ID,
  REFERENCE_HUMAN_WALLET_CONNECTOR_ORIGIN,
  serializeReferenceHumanWalletRequest,
} from "./reference-human-wallet-request.js";
import type {
  ReferenceHumanWalletConnector,
  ReferenceHumanWalletConnectorInput,
} from "./reference-human-wallet-types.js";

function requireActive(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal) || signal.aborted) {
    throw new Error("reference human wallet exchange was cancelled");
  }
}

function handoffIdentifier(sessionId: string): string {
  const value = sessionId.startsWith("sha256:") ? sessionId.slice(7) : "";
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("reference human wallet session ID is invalid");
  }
  return value;
}

function snapshotCapabilities(
  value: HumanWalletCapabilities,
): HumanWalletCapabilities {
  if (
    value.connectorKind !== "wallet-sdk" ||
    value.connectorId !== REFERENCE_HUMAN_WALLET_CONNECTOR_ID ||
    value.origin !== REFERENCE_HUMAN_WALLET_CONNECTOR_ORIGIN
  ) {
    throw new Error("reference human wallet connector identity is invalid");
  }
  return Object.freeze({
    ...value,
    connectorKind: "wallet-sdk" as const,
    approvalVersions: Object.freeze([...value.approvalVersions]),
    hashingSchemeVersions: Object.freeze([...value.hashingSchemeVersions]),
    networks: Object.freeze([...value.networks]),
    packageIds: Object.freeze([...value.packageIds]),
    signingKey: Object.freeze({ ...value.signingKey }),
    synchronizerIds: Object.freeze([...value.synchronizerIds]),
  });
}

export function createReferenceHumanWalletConnector(
  input: ReferenceHumanWalletConnectorInput,
): ReferenceHumanWalletConnector {
  const capabilities = snapshotCapabilities(input.capabilities);
  const { exchange, storage } = input;
  return Object.freeze({
    discover: async ({ signal }) => {
      requireActive(signal);
      return capabilities;
    },
    requestApproval: async (candidate, { signal }) => {
      requireActive(signal);
      const payload = serializeReferenceHumanWalletRequest(
        candidate as HumanWalletApprovalRequest,
      );
      if (
        payload.request.connectorId !== capabilities.connectorId ||
        payload.request.connectorOrigin !== capabilities.origin ||
        payload.request.approval.payerParty !== capabilities.payerParty
      ) {
        throw new Error("reference human wallet request identity is invalid");
      }
      const id = handoffIdentifier(payload.request.sessionId);
      await storage.create({
        expiresAt: payload.request.expiresAt,
        id,
        kind: "request",
        payload,
      });
      requireActive(signal);
      await exchange(id, Object.freeze({ signal }));
      requireActive(signal);
      return (await storage.read(id, "response")).payload;
    },
  });
}
