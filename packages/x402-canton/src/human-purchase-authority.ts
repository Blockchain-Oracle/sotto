import type {
  CanonicalHumanPackageSelection,
  HumanPurchaseCommitment,
  ValidatedHumanPurchaseInput,
} from "./human-purchase-commitment-types.js";
import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import type { AuthenticatedHumanPackagePreference } from "./human-package-preference-types.js";
import { createHumanAuthorizationReplayStore } from "./human-authorization-replay.js";
import { readHumanPaymentAuthority } from "./human-payment-observation.js";
import { readPaymentRequiredObservation } from "./payment-observation.js";
import { prepareHumanWalletConnectorPreflightBinding } from "./human-wallet-connector-preflight-state.js";
import { readHumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
import type {
  AuthenticatedHumanWalletConnectorPreflight,
  HumanWalletCapabilities,
} from "./human-wallet-connector-types.js";
import type { HumanPurchaseTrustedConfiguration } from "./human-purchase-commitment-types.js";

const packageBindings = new WeakMap<object, string>();
const paymentBindings = new WeakMap<object, string>();
const authorizationBindings = createHumanAuthorizationReplayStore();
const purchaseAuthorities = new WeakMap<
  object,
  HumanPurchaseCommandAuthority
>();

export type HumanPurchaseCommandAuthority = {
  readonly packageSelection: CanonicalHumanPackageSelection;
  readonly packageSelectionAuthority: AuthenticatedHumanPackagePreference;
  readonly payerIdentity: AuthenticatedHumanPayerIdentity;
  readonly requestDisplay: ValidatedHumanPurchaseInput["requestDisplay"];
  readonly walletPreflightAuthority: AuthenticatedHumanWalletConnectorPreflight;
  readonly persistence: HumanPurchasePersistenceAuthority;
  commandClaimed: boolean;
};

export type HumanPurchasePersistenceAuthority = Readonly<{
  challengeBytes: Uint8Array;
  connector: Readonly<{
    capabilities: HumanWalletCapabilities;
    expectedPackageId: string;
  }>;
  requestBindingCanonicalBytes: Uint8Array;
  trustedConfiguration: HumanPurchaseTrustedConfiguration;
}>;

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
  config: HumanPurchaseTrustedConfiguration,
): void {
  const { authorities } = input;
  const walletPreflight = requireObject(
    authorities.walletPreflight,
    "human wallet connector preflight",
  );
  const packages = requireObject(
    authorities.packageSelection,
    "human package selection",
  );
  const payment = requireObject(
    authorities.paymentObservation,
    "human payment observation",
  );
  if (packageBindings.has(packages) || paymentBindings.has(payment)) {
    throw new Error("human purchase authority is already bound");
  }
  const preflight = prepareHumanWalletConnectorPreflightBinding(
    walletPreflight,
    result.commitment,
  );
  const walletAuthority = readHumanWalletConnectorPreflightAuthority(
    authorities.walletPreflight,
  );
  const paymentAuthority = readHumanPaymentAuthority(
    authorities.paymentObservation,
  );
  const paymentState = readPaymentRequiredObservation(
    paymentAuthority.paymentObservation,
  );
  authorizationBindings.reserve(
    authorizationInstanceId,
    result.commitment,
    result.expiresAt,
  );
  preflight.commit();
  packageBindings.set(packages, result.commitment);
  paymentBindings.set(payment, result.commitment);
  purchaseAuthorities.set(result, {
    packageSelection: input.packageSelection,
    packageSelectionAuthority: authorities.packageSelection,
    payerIdentity: input.identity,
    requestDisplay: input.requestDisplay,
    walletPreflightAuthority: authorities.walletPreflight,
    persistence: Object.freeze({
      challengeBytes: Uint8Array.from(paymentState.challengeBytes),
      connector: Object.freeze({
        capabilities: walletAuthority.capabilities,
        expectedPackageId: walletAuthority.expectedPackageId,
      }),
      requestBindingCanonicalBytes: Uint8Array.from(
        input.binding.canonicalBytes,
      ),
      trustedConfiguration: Object.freeze({ ...config }),
    }),
    commandClaimed: false,
  });
}

/** @internal Authenticated prepare-authority persistence only. */
export function readHumanPurchasePersistenceAuthority(
  commitment: unknown,
): HumanPurchasePersistenceAuthority {
  return readHumanPurchaseCommandAuthority(commitment).persistence;
}

/** @internal Authenticated prepare-authority restoration only. */
export function registerRestoredHumanPurchaseCommandAuthority(input: {
  commitment: HumanPurchaseCommitment;
  packageSelection: CanonicalHumanPackageSelection;
  packageSelectionAuthority: AuthenticatedHumanPackagePreference;
  payerIdentity: AuthenticatedHumanPayerIdentity;
  persistence: HumanPurchasePersistenceAuthority;
  requestDisplay: ValidatedHumanPurchaseInput["requestDisplay"];
  walletPreflightAuthority: AuthenticatedHumanWalletConnectorPreflight;
}): void {
  const packages = requireObject(
    input.packageSelectionAuthority,
    "human package selection",
  );
  if (packageBindings.has(packages)) {
    throw new Error("human purchase authority is already bound");
  }
  const preflight = prepareHumanWalletConnectorPreflightBinding(
    input.walletPreflightAuthority,
    input.commitment.commitment,
  );
  preflight.commit();
  packageBindings.set(packages, input.commitment.commitment);
  purchaseAuthorities.set(input.commitment, {
    packageSelection: input.packageSelection,
    packageSelectionAuthority: input.packageSelectionAuthority,
    payerIdentity: input.payerIdentity,
    requestDisplay: input.requestDisplay,
    walletPreflightAuthority: input.walletPreflightAuthority,
    persistence: input.persistence,
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
