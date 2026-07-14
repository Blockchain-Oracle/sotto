import { utf8Compare } from "./package-preference-artifact-validation.js";
import { readAuthenticatedPackagePreferenceProjection } from "./package-preference-observation.js";
import type { AuthenticatedPackagePreferenceProjection } from "./package-preference-observation-types.js";
import {
  readAuthenticatedBoundedPurchaseLedgerIntent,
  readBoundedPurchaseCommandPackageAuthority,
  type BoundedPurchaseLedgerIntent,
} from "./purchase-ledger-intent.js";

export type BoundedPackageIdSelectionPreference = readonly [
  string,
  ...string[],
];

function readPreference(
  candidateIntent: BoundedPurchaseLedgerIntent,
  candidateProjection: AuthenticatedPackagePreferenceProjection,
) {
  const intent = readAuthenticatedBoundedPurchaseLedgerIntent(candidateIntent);
  const authority = readBoundedPurchaseCommandPackageAuthority(intent);
  if (candidateProjection !== authority.projection) {
    throw new Error(
      "command package selection is not the committed authenticated projection",
    );
  }
  if (authority.commandClaimed) {
    throw new Error("command package selection is already claimed");
  }
  const projection =
    readAuthenticatedPackagePreferenceProjection(candidateProjection);
  const { requirements: _requirements, ...committedProjection } =
    intent.packageSelection;
  void _requirements;
  if (JSON.stringify(projection) !== JSON.stringify(committedProjection)) {
    throw new Error("command package selection does not match the purchase");
  }
  const packageIds = [...projection.packageIds];
  if (
    packageIds.length === 0 ||
    new Set(packageIds).size !== packageIds.length ||
    JSON.stringify(packageIds) !==
      JSON.stringify([...packageIds].sort(utf8Compare))
  ) {
    throw new Error(
      "command package selection must be non-empty unique and lexical",
    );
  }
  return {
    authority,
    packageIds: Object.freeze(
      packageIds,
    ) as BoundedPackageIdSelectionPreference,
  };
}

export function readBoundedPurchaseCommandPreference(
  intent: BoundedPurchaseLedgerIntent,
  projection: AuthenticatedPackagePreferenceProjection,
): BoundedPackageIdSelectionPreference {
  return readPreference(intent, projection).packageIds;
}

export function claimBoundedPurchaseCommandPreference(
  intent: BoundedPurchaseLedgerIntent,
  projection: AuthenticatedPackagePreferenceProjection,
): BoundedPackageIdSelectionPreference {
  const state = readPreference(intent, projection);
  state.authority.commandClaimed = true;
  return state.packageIds;
}
