import { HUMAN_PURCHASE_APPROVAL_VERSION } from "./human-purchase-approval.js";
import {
  HUMAN_WALLET_CAPABILITIES_VERSION,
  HUMAN_WALLET_HASHING_SCHEME,
  type HumanWalletCapabilities,
  type HumanWalletConnectorKind,
  type HumanWalletUnsupportedResult,
} from "./human-wallet-connector-types.js";
import {
  exactHumanWalletStrings,
  humanWalletConnectorKind,
  humanWalletConnectorOrigin,
  humanWalletNetwork,
  humanWalletPackageId,
  isSupportedHumanWalletSigningKey,
  parseHumanWalletSigningKey,
  type ParsedHumanWalletSigningKey,
} from "./human-wallet-connector-validation-primitives.js";
import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

type ParsedCapabilities = Readonly<{
  approvalVersions: readonly string[];
  connectorId: string;
  connectorKind: HumanWalletConnectorKind;
  explicitApproval: unknown;
  hashingSchemeVersions: readonly string[];
  networks: readonly string[];
  origin: string;
  packageIds: readonly string[];
  payerParty: string;
  preparedTransactionSigning: unknown;
  signingKey: ParsedHumanWalletSigningKey;
  synchronizerIds: readonly string[];
  version: unknown;
}>;

function unsupported(
  parsed: ParsedCapabilities,
  reason: HumanWalletUnsupportedResult["reason"],
): Readonly<{ unsupported: HumanWalletUnsupportedResult }> {
  return {
    unsupported: Object.freeze({
      connectorId: parsed.connectorId,
      connectorKind: parsed.connectorKind,
      origin: parsed.origin,
      outcome: "unsupported",
      reason,
    }),
  };
}

function parseCapabilities(value: unknown): ParsedCapabilities {
  const record = objectValue(value, "human wallet capabilities");
  exactKeys(
    record,
    [
      "approvalVersions",
      "connectorId",
      "connectorKind",
      "explicitApproval",
      "hashingSchemeVersions",
      "networks",
      "origin",
      "packageIds",
      "payerParty",
      "preparedTransactionSigning",
      "signingKey",
      "synchronizerIds",
      "version",
    ],
    "human wallet capabilities",
  );
  return Object.freeze({
    approvalVersions: Object.freeze(
      exactHumanWalletStrings(
        record.approvalVersions,
        "human wallet approval versions",
      ),
    ),
    connectorId: identifier(
      record.connectorId,
      "human wallet connector ID",
      128,
    ),
    connectorKind: humanWalletConnectorKind(record.connectorKind),
    explicitApproval: record.explicitApproval,
    hashingSchemeVersions: Object.freeze(
      exactHumanWalletStrings(
        record.hashingSchemeVersions,
        "human wallet hash schemes",
      ),
    ),
    networks: Object.freeze(
      exactHumanWalletStrings(
        record.networks,
        "human wallet networks",
        humanWalletNetwork,
      ),
    ),
    origin: humanWalletConnectorOrigin(record.origin),
    packageIds: Object.freeze(
      exactHumanWalletStrings(
        record.packageIds,
        "human wallet package IDs",
        humanWalletPackageId,
      ),
    ),
    payerParty: identifier(record.payerParty, "human wallet payer Party"),
    preparedTransactionSigning: record.preparedTransactionSigning,
    signingKey: parseHumanWalletSigningKey(record.signingKey),
    synchronizerIds: Object.freeze(
      exactHumanWalletStrings(
        record.synchronizerIds,
        "human wallet synchronizers",
      ),
    ),
    version: record.version,
  });
}

export function parseHumanWalletCapabilities(
  value: unknown,
  expected: Readonly<{
    connectorId: string;
    connectorKind: HumanWalletConnectorKind;
    origin: string;
    packageId: string;
  }>,
):
  | Readonly<{ capabilities: HumanWalletCapabilities }>
  | Readonly<{ unsupported: HumanWalletUnsupportedResult }> {
  const parsed = parseCapabilities(value);
  if (
    parsed.connectorId !== expected.connectorId ||
    parsed.connectorKind !== expected.connectorKind ||
    parsed.origin !== expected.origin
  ) {
    throw new Error("human wallet identity does not match its registration");
  }
  const checks: ReadonlyArray<
    readonly [boolean, HumanWalletUnsupportedResult["reason"]]
  > = [
    [
      parsed.version === HUMAN_WALLET_CAPABILITIES_VERSION,
      "unsupported-capabilities-version",
    ],
    [parsed.packageIds.includes(expected.packageId), "unsupported-package"],
    [
      parsed.hashingSchemeVersions.includes(HUMAN_WALLET_HASHING_SCHEME),
      "unsupported-hashing-scheme",
    ],
    [
      parsed.approvalVersions.includes(HUMAN_PURCHASE_APPROVAL_VERSION),
      "unsupported-approval-version",
    ],
    [parsed.networks.length > 0, "unsupported-network"],
    [parsed.synchronizerIds.length > 0, "unsupported-synchronizer"],
    [
      parsed.payerParty.endsWith(`::${parsed.signingKey.fingerprint}`),
      "unsupported-key-fingerprint",
    ],
    [
      isSupportedHumanWalletSigningKey(parsed.signingKey),
      parsed.signingKey.publicKeyFormat === "PUBLIC_KEY_FORMAT_RAW" ||
      parsed.signingKey.publicKeyFormat === "PUBLIC_KEY_FORMAT_DER_SPKI"
        ? "unsupported-signature-scheme"
        : "unsupported-key-format",
    ],
    [
      parsed.preparedTransactionSigning === true,
      "unsupported-prepared-signing",
    ],
    [parsed.explicitApproval === true, "unsupported-explicit-approval"],
  ];
  const failed = checks.find(([supported]) => !supported);
  if (failed !== undefined) return unsupported(parsed, failed[1]);
  return { capabilities: parsed as HumanWalletCapabilities };
}
