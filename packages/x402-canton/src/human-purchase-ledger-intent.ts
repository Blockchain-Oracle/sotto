import { readAuthenticatedHumanPackagePreferenceAt } from "./human-package-preference-observation.js";
import { readHumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";
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
import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";

const intentsByCommitment = new WeakMap<object, HumanPurchaseLedgerIntent>();
type AuthenticHumanIntentState = Readonly<{
  authority: HumanPurchaseCommandAuthority;
  intent: HumanPurchaseLedgerIntent;
}>;

const authenticIntents = new WeakMap<object, AuthenticHumanIntentState>();

function readIntentState(candidate: unknown): AuthenticHumanIntentState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human purchase Ledger intent is not authenticated");
  }
  const state = authenticIntents.get(candidate);
  if (state === undefined) {
    throw new Error("human purchase Ledger intent is not authenticated");
  }
  return state;
}

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
  return readIntentState(candidate).intent;
}

function canonicalPackageAuthority(authority: HumanPurchaseCommandAuthority) {
  const value = authority.packageSelectionAuthority;
  return {
    version: value.version,
    closureHash: value.closureHash,
    references: [
      {
        packageId: value.references[0].packageId,
        packageName: value.references[0].packageName,
        packageVersion: value.references[0].packageVersion,
        artifactIds: value.references[0].artifactIds,
      },
    ],
    packageIds: value.packageIds,
    parties: value.parties,
    synchronizerId: value.synchronizerId,
    vettingValidAt: value.vettingValidAt,
    acquiredAt: value.acquiredAt,
    subjectHash: value.subjectHash,
  };
}

function requireFreshCommandAuthority(
  authority: HumanPurchaseCommandAuthority,
  intent: HumanPurchaseLedgerIntent,
  now: number,
): void {
  const identity = readHumanWalletConnectorPreflightAuthority(
    authority.walletPreflightAuthority,
    now,
  ).identity;
  readAuthenticatedHumanPackagePreferenceAt(
    authority.packageSelectionAuthority,
    now,
  );
  if (
    JSON.stringify(identity) !== JSON.stringify(intent.payerIdentity) ||
    JSON.stringify(canonicalPackageAuthority(authority)) !==
      JSON.stringify(intent.packageSelection)
  ) {
    throw new Error("human purchase command authority does not match");
  }
}

/** @internal Human command construction only. */
export function prepareHumanPurchaseCommandAuthorityClaim(
  candidate: unknown,
  now: number,
) {
  const state = readIntentState(candidate);
  const { authority, intent } = state;
  if (authority.commandClaimed) {
    throw new Error("human purchase command authority does not match");
  }
  requireFreshCommandAuthority(authority, intent, now);
  if (
    Date.parse(intent.challenge.executeBefore) - now <
    MIN_HUMAN_SIGNING_RESERVE_MS
  ) {
    throw new Error("human purchase command lacks the signing reserve");
  }
  return {
    intent,
    packageIds: Object.freeze([
      intent.packageSelection.packageIds[0],
    ]) as readonly [string],
    requireFresh: (candidateNow: number) =>
      requireFreshCommandAuthority(authority, intent, candidateNow),
    commit: () => {
      authority.commandClaimed = true;
    },
  };
}

export type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent-types.js";
