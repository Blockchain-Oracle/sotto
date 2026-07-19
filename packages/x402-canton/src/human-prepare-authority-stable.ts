import {
  readAuthenticatedHumanPackagePreferenceAt,
  readHumanPackagePreferenceAuthority,
} from "./human-package-preference-observation.js";
import type { AuthenticatedHumanPackagePreference } from "./human-package-preference-types.js";
import type { HumanPayerSigningIdentity } from "./human-purchase-ledger-intent-types.js";
import type { CanonicalHumanPackageSelection } from "./human-purchase-commitment-types.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { readHumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
import type { AuthenticatedHumanWalletConnectorPreflight } from "./human-wallet-connector-types.js";

function withoutAcquiredAt<T extends { acquiredAt: string }>(value: T) {
  const { acquiredAt: _acquiredAt, ...stable } = value;
  void _acquiredAt;
  return stable;
}

function canonicalFreshPackages(value: AuthenticatedHumanPackagePreference) {
  return {
    version: value.version,
    closureHash: value.closureHash,
    references: value.references.map((reference) => ({
      packageId: reference.packageId,
      packageName: reference.packageName,
      packageVersion: reference.packageVersion,
      artifactIds: reference.artifactIds,
    })),
    packageIds: value.packageIds,
    parties: value.parties,
    synchronizerId: value.synchronizerId,
    vettingValidAt: value.vettingValidAt,
    subjectHash: value.subjectHash,
  };
}

export function sameStableHumanPayerIdentity(
  fresh: HumanPayerSigningIdentity,
  original: HumanPayerSigningIdentity,
): boolean {
  return (
    JSON.stringify(withoutAcquiredAt(fresh)) ===
    JSON.stringify(withoutAcquiredAt(original))
  );
}

export function sameStableHumanPackageSelection(
  fresh: AuthenticatedHumanPackagePreference,
  original: CanonicalHumanPackageSelection,
): boolean {
  return (
    JSON.stringify(canonicalFreshPackages(fresh)) ===
    JSON.stringify(withoutAcquiredAt(original))
  );
}

export function requireFreshHumanPrepareAuthorities(
  intent: HumanPurchaseLedgerIntent,
  walletPreflight: AuthenticatedHumanWalletConnectorPreflight,
  packageSelection: AuthenticatedHumanPackagePreference,
  now: number,
) {
  const wallet = readHumanWalletConnectorPreflightAuthority(
    walletPreflight,
    now,
  );
  const packages = readAuthenticatedHumanPackagePreferenceAt(
    packageSelection,
    now,
  );
  const scope = readHumanPackagePreferenceAuthority(packageSelection);
  const checks = [
    [
      sameStableHumanPayerIdentity(wallet.identity, intent.payerIdentity),
      "payer",
    ],
    [
      sameStableHumanPackageSelection(packages, intent.packageSelection),
      "package",
    ],
    [scope.walletPreflight === walletPreflight, "wallet preflight"],
    [scope.adminParty === intent.challenge.instrument.admin, "admin"],
    [scope.challengeId === intent.challenge.challengeId, "challenge"],
    [
      scope.challengeObservedAt === intent.challenge.requestedAt,
      "observation time",
    ],
    [scope.executeBefore === intent.challenge.executeBefore, "expiry"],
    [scope.providerParty === intent.challenge.recipientParty, "provider"],
    [scope.synchronizerId === intent.challenge.synchronizerId, "synchronizer"],
  ] as const;
  const failed = checks.find(([matches]) => !matches);
  if (failed !== undefined) {
    throw new Error(
      `fresh human prepare ${failed[1]} authority does not match`,
    );
  }
  return Object.freeze({ packages, wallet });
}
