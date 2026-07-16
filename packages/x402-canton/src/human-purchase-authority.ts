import type {
  HumanPurchaseCommitmentInput,
  HumanPurchaseCommitment,
} from "./human-purchase-commitment-types.js";

const identityBindings = new WeakMap<object, string>();
const packageBindings = new WeakMap<object, string>();
const paymentBindings = new WeakMap<object, string>();
const authorizationBindings = new Map<string, string>();

function requireObject(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} is not authenticated`);
  }
  return value;
}

export function bindHumanPurchaseAuthorities(
  input: HumanPurchaseCommitmentInput,
  authorizationInstanceId: string,
  result: HumanPurchaseCommitment,
): void {
  const identity = requireObject(input.payerIdentity, "human payer identity");
  const packages = requireObject(
    input.packageSelection,
    "human package selection",
  );
  const payment = requireObject(
    input.paymentObservation,
    "human payment observation",
  );
  if (
    identityBindings.has(identity) ||
    packageBindings.has(packages) ||
    paymentBindings.has(payment) ||
    authorizationBindings.has(authorizationInstanceId)
  ) {
    throw new Error("human purchase authority is already bound");
  }
  identityBindings.set(identity, result.commitment);
  packageBindings.set(packages, result.commitment);
  paymentBindings.set(payment, result.commitment);
  authorizationBindings.set(authorizationInstanceId, result.commitment);
}
