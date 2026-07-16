import {
  assertAuthenticHumanPurchase,
  type HumanPurchaseCommitment,
} from "./human-purchase-commitment.js";
import {
  readHumanPurchaseCommandAuthority,
  type HumanPurchaseCommandAuthority,
} from "./human-purchase-authority.js";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent-types.js";
import { projectHumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent-validation.js";

const intentsByCommitment = new WeakMap<object, HumanPurchaseLedgerIntent>();
type AuthenticHumanIntentState = Readonly<{
  authority: HumanPurchaseCommandAuthority;
  intent: HumanPurchaseLedgerIntent;
}>;

const authenticIntents = new WeakMap<object, AuthenticHumanIntentState>();

function freezeIntent(
  intent: HumanPurchaseLedgerIntent,
): HumanPurchaseLedgerIntent {
  Object.freeze(intent.actAs);
  Object.freeze(intent.request);
  Object.freeze(intent.challenge.instrument);
  Object.freeze(intent.challenge);
  Object.freeze(intent.payerIdentity);
  Object.freeze(intent.limits);
  Object.freeze(intent.tokenFactory);
  for (const reference of intent.packageSelection.references) {
    Object.freeze(reference.artifactIds);
    Object.freeze(reference);
  }
  Object.freeze(intent.packageSelection.references);
  Object.freeze(intent.packageSelection.packageIds);
  Object.freeze(intent.packageSelection.parties);
  Object.freeze(intent.packageSelection);
  return Object.freeze(intent);
}

export function readHumanPurchaseLedgerIntent(
  commitment: HumanPurchaseCommitment,
): HumanPurchaseLedgerIntent {
  assertAuthenticHumanPurchase(commitment);
  const cached = intentsByCommitment.get(commitment);
  if (cached !== undefined) return cached;
  const authority = readHumanPurchaseCommandAuthority(commitment);
  const intent = freezeIntent(
    projectHumanPurchaseLedgerIntent(commitment, authority),
  );
  intentsByCommitment.set(commitment, intent);
  authenticIntents.set(intent, { authority, intent });
  return intent;
}

/** @internal Human observers and command builders reject structural look-alikes. */
export function readAuthenticatedHumanPurchaseLedgerIntent(
  candidate: unknown,
): HumanPurchaseLedgerIntent {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human purchase Ledger intent is not authenticated");
  }
  const state = authenticIntents.get(candidate);
  if (state === undefined) {
    throw new Error("human purchase Ledger intent is not authenticated");
  }
  return state.intent;
}

export type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent-types.js";
