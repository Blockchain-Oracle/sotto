import type {
  AuthenticatedHumanWalletConnectorPreflight,
  HumanWalletConnector,
} from "../src/human-wallet-connector-types.js";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import { HUMAN_PURCHASE_APPROVAL_VERSION } from "../src/human-purchase-approval.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";
import {
  HUMAN_PAYER,
  HUMAN_PAYER_FINGERPRINT,
  HUMAN_SYNCHRONIZER,
  humanPayerIdentityObserver,
} from "./human-payer-identity.fixtures.js";

export const HUMAN_CONNECTOR_ID = "wallet-sdk-human-reference";
export const HUMAN_CONNECTOR_ORIGIN = "wallet://sotto-human-reference";
export const HUMAN_PACKAGE_ID = validClosureInput().graphPackages.find(
  ({ name }) => name === "splice-amulet",
)!.packageId;

export const HUMAN_CONNECTOR_CAPABILITIES = Object.freeze({
  version: "sotto-human-wallet-capabilities-v1" as const,
  approvalVersions: Object.freeze([HUMAN_PURCHASE_APPROVAL_VERSION]),
  connectorId: HUMAN_CONNECTOR_ID,
  connectorKind: "wallet-sdk" as const,
  explicitApproval: true,
  hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2"]),
  networks: Object.freeze(["canton:devnet"]),
  origin: HUMAN_CONNECTOR_ORIGIN,
  packageIds: Object.freeze([HUMAN_PACKAGE_ID]),
  payerParty: HUMAN_PAYER,
  preparedTransactionSigning: true,
  signingKey: Object.freeze({
    fingerprint: HUMAN_PAYER_FINGERPRINT,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    purpose: "SIGNING" as const,
    signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
  }),
  synchronizerIds: Object.freeze([HUMAN_SYNCHRONIZER]),
});

export function mutateHumanConnectorCapabilities(
  mutate: (candidate: Record<string, unknown>) => void,
): unknown {
  const candidate = structuredClone(
    HUMAN_CONNECTOR_CAPABILITIES,
  ) as unknown as Record<string, unknown>;
  mutate(candidate);
  return candidate;
}

export function humanConnector(
  capabilities: unknown = HUMAN_CONNECTOR_CAPABILITIES,
): HumanWalletConnector {
  return {
    discover: async () => capabilities,
    requestApproval: async () => {
      throw new Error("preflight must not request approval");
    },
  };
}

export function humanPreflightInput(
  capabilities: unknown = HUMAN_CONNECTOR_CAPABILITIES,
  expectedPackageId = HUMAN_PACKAGE_ID,
  observePayerIdentity = humanPayerIdentityObserver(),
) {
  return {
    connector: humanConnector(capabilities),
    connectorId: HUMAN_CONNECTOR_ID,
    connectorKind: "wallet-sdk" as const,
    connectorOrigin: HUMAN_CONNECTOR_ORIGIN,
    expectedPackageId,
    observePayerIdentity,
  };
}

export async function authenticatedHumanWalletPreflight(
  expectedPackageId = HUMAN_PACKAGE_ID,
): Promise<AuthenticatedHumanWalletConnectorPreflight> {
  const capabilities = mutateHumanConnectorCapabilities((candidate) => {
    candidate.packageIds = [expectedPackageId];
  });
  const result = await createHumanWalletConnectorPreflight(
    humanPreflightInput(capabilities, expectedPackageId),
  );
  if (result.outcome !== "compatible") {
    throw new Error("test human wallet preflight is incompatible");
  }
  return result;
}
