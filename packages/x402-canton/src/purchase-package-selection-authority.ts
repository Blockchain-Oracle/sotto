import type { AuthenticatedPackagePreferenceProjection } from "./package-preference-observation-types.js";
import type { CanonicalPurchasePackageSelection } from "./purchase-package-selection-types.js";

export type BoundedPurchasePackageSelectionAuthority = {
  readonly canonical: CanonicalPurchasePackageSelection;
  readonly projection: AuthenticatedPackagePreferenceProjection;
  commandClaimed: boolean;
};

type ProjectionBinding = Readonly<{
  authority: BoundedPurchasePackageSelectionAuthority;
  purchaseCommitment: string;
}>;

const projectionBindings = new WeakMap<object, ProjectionBinding>();
const purchaseAuthorities = new WeakMap<
  object,
  BoundedPurchasePackageSelectionAuthority
>();

export function bindBoundedPurchasePackageSelectionAuthority(
  purchase: object,
  purchaseCommitment: string,
  canonical: CanonicalPurchasePackageSelection,
  projection: AuthenticatedPackagePreferenceProjection,
): void {
  const current = projectionBindings.get(projection);
  if (
    current !== undefined &&
    current.purchaseCommitment !== purchaseCommitment
  ) {
    throw new Error("purchase package selection is already bound");
  }
  const authority =
    current?.authority ??
    ({
      canonical,
      projection,
      commandClaimed: false,
    } satisfies BoundedPurchasePackageSelectionAuthority);
  if (
    current !== undefined &&
    JSON.stringify(current.authority.canonical) !== JSON.stringify(canonical)
  ) {
    throw new Error("purchase package selection binding is inconsistent");
  }
  projectionBindings.set(projection, { authority, purchaseCommitment });
  purchaseAuthorities.set(purchase, authority);
}

export function readBoundedPurchasePackageSelectionAuthority(
  purchase: object,
): BoundedPurchasePackageSelectionAuthority {
  const authority = purchaseAuthorities.get(purchase);
  if (authority === undefined) {
    throw new Error("bounded purchase package authority is not authenticated");
  }
  return authority;
}
