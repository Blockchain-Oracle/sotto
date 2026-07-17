import { randomBytes } from "node:crypto";
import { claimHumanPayerIdentity } from "./human-payer-identity.js";
import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
} from "./human-observation-deadline.js";
import { validateHumanWalletConnectorPreflightInput } from "./human-wallet-connector-input-validation.js";
import { registerHumanWalletConnectorPreflight } from "./human-wallet-connector-preflight-state.js";
import {
  HUMAN_WALLET_PREFLIGHT_VERSION,
  MAX_HUMAN_WALLET_PREFLIGHT_ACQUISITION_MS,
  type AuthenticatedHumanWalletConnectorPreflight,
  type HumanWalletConnectorPreflightInput,
  type HumanWalletConnectorPreflightResult,
  type HumanWalletPreflightOptions,
  type HumanWalletUnsupportedReason,
} from "./human-wallet-connector-types.js";
import { parseHumanWalletCapabilities } from "./human-wallet-connector-validation.js";

async function callConnectorDiscovery(
  call: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await call();
  } catch {
    throw new Error("human wallet connector discovery failed");
  }
}

async function observeIdentity(
  call: () => ReturnType<
    HumanWalletConnectorPreflightInput["observePayerIdentity"]
  >,
) {
  try {
    return await call();
  } catch {
    throw new Error("human wallet payer identity read failed");
  }
}

export async function createHumanWalletConnectorPreflight(
  candidate: HumanWalletConnectorPreflightInput,
  options: HumanWalletPreflightOptions = {},
): Promise<HumanWalletConnectorPreflightResult> {
  const input = validateHumanWalletConnectorPreflightInput(candidate);
  return await withHumanObservationDeadline(
    "human wallet connector preflight",
    MAX_HUMAN_WALLET_PREFLIGHT_ACQUISITION_MS,
    options,
    async (signal) => {
      const acquisitionStartedAt = Date.now();
      const callOptions = Object.freeze({ signal });
      const discovered = await callConnectorDiscovery(() =>
        input.connector.discover(callOptions),
      );
      requireHumanObservationActive(signal, "human wallet connector preflight");
      let parsed: ReturnType<typeof parseHumanWalletCapabilities>;
      try {
        parsed = parseHumanWalletCapabilities(discovered, {
          connectorId: input.connectorId,
          connectorKind: input.connectorKind,
          origin: input.connectorOrigin,
          packageId: input.expectedPackageId,
        });
      } catch {
        throw new Error("human wallet capabilities are invalid");
      }
      if ("unsupported" in parsed) return parsed.unsupported;
      const observation = await observeIdentity(() =>
        input.observePayerIdentity(callOptions),
      );
      requireHumanObservationActive(signal, "human wallet connector preflight");
      const identity = claimHumanPayerIdentity(observation);
      const capabilities = parsed.capabilities;
      const identityChecks: ReadonlyArray<
        readonly [boolean, HumanWalletUnsupportedReason]
      > = [
        [capabilities.payerParty === identity.party, "unsupported-payer"],
        [
          capabilities.networks.includes(identity.network),
          "unsupported-network",
        ],
        [
          capabilities.synchronizerIds.includes(identity.synchronizerId),
          "unsupported-synchronizer",
        ],
        [
          capabilities.signingKey.fingerprint === identity.publicKeyFingerprint,
          "unsupported-key-fingerprint",
        ],
        [
          capabilities.signingKey.publicKeyFormat === identity.publicKeyFormat,
          "unsupported-key-format",
        ],
        [
          capabilities.signingKey.purpose === identity.keyPurpose &&
            capabilities.signingKey.signatureFormat ===
              identity.signatureFormat &&
            capabilities.signingKey.signingAlgorithm ===
              identity.signingAlgorithm,
          "unsupported-signature-scheme",
        ],
      ];
      const failed = identityChecks.find(([supported]) => !supported);
      if (failed !== undefined) {
        return Object.freeze({
          connectorId: capabilities.connectorId,
          connectorKind: capabilities.connectorKind,
          origin: capabilities.origin,
          outcome: "unsupported" as const,
          reason: failed[1],
        });
      }
      const capturedAt = Date.now();
      const projection = Object.freeze({
        version: HUMAN_WALLET_PREFLIGHT_VERSION,
        outcome: "compatible" as const,
        preflightId: `sha256:${randomBytes(32).toString("hex")}` as const,
        connectorId: capabilities.connectorId,
        connectorKind: capabilities.connectorKind,
        origin: capabilities.origin,
        observedAt: new Date(capturedAt).toISOString(),
      }) as AuthenticatedHumanWalletConnectorPreflight;
      registerHumanWalletConnectorPreflight({
        acquisitionStartedAt,
        capabilities,
        capturedAt,
        connector: input.connector,
        expectedPackageId: input.expectedPackageId,
        identity,
        projection,
      });
      return projection;
    },
  );
}

export {
  HUMAN_WALLET_CAPABILITIES_VERSION,
  HUMAN_WALLET_PREFLIGHT_VERSION,
  MAX_HUMAN_WALLET_PREFLIGHT_ACQUISITION_MS,
  MAX_HUMAN_WALLET_PREFLIGHT_AGE_MS,
} from "./human-wallet-connector-types.js";
