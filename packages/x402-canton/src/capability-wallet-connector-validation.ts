import {
  CAPABILITY_WALLET_CAPABILITIES_VERSION,
  CAPABILITY_WALLET_HASHING_SCHEME,
  CAPABILITY_WALLET_SIGNATURE_FORMAT,
  CAPABILITY_WALLET_SIGNING_ALGORITHM,
  type CapabilityWalletCapabilities,
  type CapabilityWalletConnectorKind,
  type CapabilityWalletUnsupportedResult,
} from "./capability-wallet-connector-types.js";
import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

const MAXIMUM_CAPABILITY_VALUES = 16;

function exactStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAXIMUM_CAPABILITY_VALUES ||
    Object.keys(value).length !== value.length
  ) {
    throw new Error(`${label} must be a bounded array`);
  }
  const result = value.map((entry, index) =>
    identifier(entry, `${label}[${index}]`, 512),
  );
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must be unique`);
  }
  return result;
}

function connectorKind(value: unknown): CapabilityWalletConnectorKind {
  if (value !== "openrpc" && value !== "wallet-sdk") {
    throw new Error("capability wallet connector kind is unsupported");
  }
  return value;
}

export function parseCapabilityWalletCapabilities(
  value: unknown,
  expected: Readonly<{
    connectorId: string;
    origin: string;
    packageId: string;
    network: string;
    payerParty: string;
  }>,
):
  | Readonly<{ capabilities: CapabilityWalletCapabilities }>
  | Readonly<{ unsupported: CapabilityWalletUnsupportedResult }> {
  const record = objectValue(value, "capability wallet capabilities");
  exactKeys(
    record,
    [
      "connectorId",
      "connectorKind",
      "explicitApproval",
      "hashingSchemeVersions",
      "networks",
      "origin",
      "packageIds",
      "payerParty",
      "preparedTransactionSigning",
      "signatureFormats",
      "signingAlgorithms",
      "version",
    ],
    "capability wallet capabilities",
  );
  const parsed = Object.freeze({
    connectorId: identifier(record.connectorId, "wallet connector ID", 128),
    connectorKind: connectorKind(record.connectorKind),
    explicitApproval: record.explicitApproval,
    hashingSchemeVersions: Object.freeze(
      exactStringArray(record.hashingSchemeVersions, "wallet hash schemes"),
    ),
    networks: Object.freeze(
      exactStringArray(record.networks, "wallet networks"),
    ),
    origin: identifier(record.origin, "wallet connector origin", 512),
    packageIds: Object.freeze(
      exactStringArray(record.packageIds, "wallet package IDs"),
    ),
    payerParty: identifier(record.payerParty, "wallet payer Party"),
    preparedTransactionSigning: record.preparedTransactionSigning,
    signatureFormats: Object.freeze(
      exactStringArray(record.signatureFormats, "wallet signature formats"),
    ),
    signingAlgorithms: Object.freeze(
      exactStringArray(record.signingAlgorithms, "wallet signing algorithms"),
    ),
    version: record.version,
  });
  if (
    parsed.connectorId !== expected.connectorId ||
    parsed.origin !== expected.origin ||
    parsed.payerParty !== expected.payerParty ||
    parsed.version !== CAPABILITY_WALLET_CAPABILITIES_VERSION
  ) {
    throw new Error("capability wallet identity does not match the session");
  }
  const identity = {
    connectorId: parsed.connectorId,
    connectorKind: parsed.connectorKind,
    origin: parsed.origin,
  } as const;
  const checks: ReadonlyArray<readonly [boolean, `unsupported-${string}`]> = [
    [parsed.networks.includes(expected.network), "unsupported-network"],
    [parsed.packageIds.includes(expected.packageId), "unsupported-package"],
    [
      parsed.hashingSchemeVersions.includes(CAPABILITY_WALLET_HASHING_SCHEME),
      "unsupported-hashing-scheme",
    ],
    [
      parsed.signatureFormats.includes(CAPABILITY_WALLET_SIGNATURE_FORMAT),
      "unsupported-signature-format",
    ],
    [
      parsed.signingAlgorithms.includes(CAPABILITY_WALLET_SIGNING_ALGORITHM),
      "unsupported-signing-algorithm",
    ],
    [
      parsed.preparedTransactionSigning === true,
      "unsupported-prepared-signing",
    ],
    [parsed.explicitApproval === true, "unsupported-explicit-approval"],
  ];
  const unsupported = checks.find(([supported]) => !supported);
  if (unsupported !== undefined) {
    return {
      unsupported: Object.freeze({
        ...identity,
        outcome: "unsupported",
        reason: unsupported[1],
      }),
    };
  }
  return { capabilities: parsed as CapabilityWalletCapabilities };
}
