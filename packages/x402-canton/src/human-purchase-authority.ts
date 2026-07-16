import type {
  CanonicalHumanPackageSelection,
  HumanPurchaseCommitment,
  ValidatedHumanPurchaseInput,
} from "./human-purchase-commitment-types.js";
import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import { createHumanAuthorizationReplayStore } from "./human-authorization-replay.js";

const identityBindings = new WeakMap<object, string>();
const packageBindings = new WeakMap<object, string>();
const paymentBindings = new WeakMap<object, string>();
const authorizationBindings = createHumanAuthorizationReplayStore();
const purchaseAuthorities = new WeakMap<
  object,
  HumanPurchaseCommandAuthority
>();

export type HumanPurchaseCommandAuthority = {
  readonly packageSelection: CanonicalHumanPackageSelection;
  readonly payerIdentity: AuthenticatedHumanPayerIdentity;
  commandClaimed: boolean;
};

function requireObject(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} is not authenticated`);
  }
  return value;
}

export function bindHumanPurchaseAuthorities(
  input: ValidatedHumanPurchaseInput,
  authorizationInstanceId: string,
  result: HumanPurchaseCommitment,
): void {
  const { authorities } = input;
  const identity = requireObject(
    authorities.payerIdentity,
    "human payer identity",
  );
  const packages = requireObject(
    authorities.packageSelection,
    "human package selection",
  );
  const payment = requireObject(
    authorities.paymentObservation,
    "human payment observation",
  );
  if (
    identityBindings.has(identity) ||
    packageBindings.has(packages) ||
    paymentBindings.has(payment)
  ) {
    throw new Error("human purchase authority is already bound");
  }
  authorizationBindings.reserve(
    authorizationInstanceId,
    result.commitment,
    result.expiresAt,
  );
  identityBindings.set(identity, result.commitment);
  packageBindings.set(packages, result.commitment);
  paymentBindings.set(payment, result.commitment);
  purchaseAuthorities.set(result, {
    packageSelection: input.packageSelection,
    payerIdentity: input.identity,
    commandClaimed: false,
  });
}

/** @internal Human intent and command construction only. */
export function readHumanPurchaseCommandAuthority(
  commitment: unknown,
): HumanPurchaseCommandAuthority {
  if (typeof commitment !== "object" || commitment === null) {
    throw new Error("human purchase command authority is not authenticated");
  }
  const authority = purchaseAuthorities.get(commitment);
  if (authority === undefined) {
    throw new Error("human purchase command authority is not authenticated");
  }
  return authority;
}
