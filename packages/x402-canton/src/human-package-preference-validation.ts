import { utf8Compare } from "./package-preference-artifact-validation.js";
import {
  MAX_HUMAN_PAYER_IDENTITY_AGE_MS,
  readAuthenticatedHumanPayerIdentity,
} from "./human-payer-identity.js";
import { requireReviewedPackagePreferenceClosure } from "./package-preference-closure.js";
import type {
  HumanPackagePreferenceReader,
  HumanPackagePreferenceScope,
  ValidatedHumanPackagePreferenceScope,
} from "./human-package-preference-types.js";
import {
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export function validateHumanPackagePreferenceReader(
  value: HumanPackagePreferenceReader,
): HumanPackagePreferenceReader {
  const record = objectValue(value, "human package preference reader");
  exactKeys(
    record,
    ["readAuthenticatedSubject", "readPackageReferences"],
    "human package preference reader",
  );
  if (
    typeof record.readAuthenticatedSubject !== "function" ||
    typeof record.readPackageReferences !== "function"
  ) {
    throw new Error("human package preference reader functions are required");
  }
  return value;
}

function requireHumanClosure(value: unknown) {
  const closure = requireReviewedPackagePreferenceClosure(value);
  if (
    JSON.stringify(closure.selectablePackageNames) !==
      JSON.stringify(["splice-amulet"]) ||
    closure.artifacts.some(({ name }) => name === "sotto-control") ||
    closure.graphPackages.some(({ name }) => name === "sotto-control")
  ) {
    throw new Error(
      "human package preference closure must contain exactly splice-amulet",
    );
  }
  return closure;
}

export function validateHumanPackagePreferenceScope(
  value: HumanPackagePreferenceScope,
): ValidatedHumanPackagePreferenceScope {
  const record = objectValue(value, "human package preference scope");
  exactKeys(
    record,
    [
      "adminParty",
      "challengeObservedAt",
      "closure",
      "executeBefore",
      "payerIdentity",
      "providerParty",
      "vettingValidAt",
    ],
    "human package preference scope",
  );
  const payerIdentity = readAuthenticatedHumanPayerIdentity(
    record.payerIdentity,
  );
  const now = Date.now();
  const payerAcquiredAtMs = canonicalTime(
    payerIdentity.acquiredAt,
    "human payer identity acquiredAt",
  );
  if (now - payerAcquiredAtMs < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("human payer identity clock moved backwards");
  }
  if (now - payerAcquiredAtMs > MAX_HUMAN_PAYER_IDENTITY_AGE_MS) {
    throw new Error("human payer identity is stale");
  }
  const adminParty = identifier(record.adminParty, "human package admin Party");
  const providerParty = identifier(
    record.providerParty,
    "human package provider Party",
  );
  const parties = [adminParty, payerIdentity.party, providerParty].sort(
    utf8Compare,
  );
  if (new Set(parties).size !== 3) {
    throw new Error("human package preference Parties must be distinct");
  }
  const challengeObservedAtMs = canonicalTime(
    record.challengeObservedAt,
    "human package challenge observedAt",
  );
  const executeBeforeMs = canonicalTime(
    record.executeBefore,
    "human package executeBefore",
  );
  const vettingValidAtMs = canonicalTime(
    record.vettingValidAt,
    "human package vettingValidAt",
  );
  if (
    now < challengeObservedAtMs - CLOCK_ROLLBACK_TOLERANCE_MS ||
    challengeObservedAtMs > now ||
    now >= executeBeforeMs ||
    vettingValidAtMs < now ||
    vettingValidAtMs > executeBeforeMs
  ) {
    throw new Error("human package preference timing is outside the challenge");
  }
  return Object.freeze({
    adminParty,
    challengeObservedAt: record.challengeObservedAt as string,
    closure: requireHumanClosure(record.closure),
    executeBefore: record.executeBefore as string,
    parties: Object.freeze(parties) as readonly [string, string, string],
    payerIdentity,
    providerParty,
    synchronizerId: payerIdentity.synchronizerId,
    vettingValidAt: record.vettingValidAt as string,
  });
}
