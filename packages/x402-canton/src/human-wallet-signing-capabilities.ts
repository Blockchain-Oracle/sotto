import type { HumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
import type {
  HumanWalletCapabilities,
  HumanWalletUnsupportedResult,
} from "./human-wallet-connector-types.js";
import { parseHumanWalletCapabilities } from "./human-wallet-connector-validation.js";

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

function sameCapabilities(
  left: HumanWalletCapabilities,
  right: HumanWalletCapabilities,
): boolean {
  return (
    left.version === right.version &&
    left.connectorId === right.connectorId &&
    left.connectorKind === right.connectorKind &&
    left.explicitApproval === right.explicitApproval &&
    left.origin === right.origin &&
    left.payerParty === right.payerParty &&
    left.preparedTransactionSigning === right.preparedTransactionSigning &&
    sameStrings(left.approvalVersions, right.approvalVersions) &&
    sameStrings(left.hashingSchemeVersions, right.hashingSchemeVersions) &&
    sameStrings(left.networks, right.networks) &&
    sameStrings(left.packageIds, right.packageIds) &&
    sameStrings(left.synchronizerIds, right.synchronizerIds) &&
    JSON.stringify(left.signingKey) === JSON.stringify(right.signingKey)
  );
}

export async function rediscoverHumanWalletCapabilities(
  authority: HumanWalletConnectorPreflightAuthority,
  signal: AbortSignal,
): Promise<
  | Readonly<{ capabilities: HumanWalletCapabilities }>
  | Readonly<{ unsupported: HumanWalletUnsupportedResult }>
> {
  let discovered: unknown;
  try {
    discovered = await authority.connector.discover(Object.freeze({ signal }));
  } catch {
    throw new Error("human wallet connector rediscovery failed");
  }
  let parsed: ReturnType<typeof parseHumanWalletCapabilities>;
  try {
    parsed = parseHumanWalletCapabilities(discovered, {
      connectorId: authority.capabilities.connectorId,
      connectorKind: authority.capabilities.connectorKind,
      origin: authority.capabilities.origin,
      packageId: authority.expectedPackageId,
    });
  } catch {
    throw new Error("human wallet capabilities rediscovery is invalid");
  }
  if ("unsupported" in parsed) return parsed;
  if (!sameCapabilities(parsed.capabilities, authority.capabilities)) {
    throw new Error("human wallet capabilities changed since preflight");
  }
  return parsed;
}
