import type {
  HumanPurchaseCommitment,
  ValidatedHumanPurchaseInput,
} from "./human-purchase-commitment-types.js";
import { createHumanAuthorizationReplayStore } from "./human-authorization-replay.js";

const identityBindings = new WeakMap<object, string>();
const packageBindings = new WeakMap<object, string>();
const paymentBindings = new WeakMap<object, string>();
const authorizationBindings = createHumanAuthorizationReplayStore();

function requireObject(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} is not authenticated`);
  }
  return value;
}

export function bindHumanPurchaseAuthorities(
  authorities: ValidatedHumanPurchaseInput["authorities"],
  authorizationInstanceId: string,
  result: HumanPurchaseCommitment,
): void {
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
}
