import { createHash } from "node:crypto";
import {
  buildReviewedPackagePreferenceClosure,
  type ReviewedPackagePreferenceClosure,
} from "../src/package-preference-closure.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";
import { AGENT, DSO, PAYER, PROVIDER } from "./purchase-commitment.fixtures.js";

export const SYNCHRONIZER = "global-domain::1220sync";
export const SUBJECT = "validator-devnet-m2m";
export const OBSERVED_AT = "2026-07-14T10:00:00.000Z";
export const VETTING_VALID_AT = "2026-07-14T10:00:30.000Z";
export const PARTIES = Object.freeze([AGENT, PAYER, PROVIDER].sort());

export function observationClosure(): ReviewedPackagePreferenceClosure {
  return buildReviewedPackagePreferenceClosure(validClosureInput());
}

export function oneNameClosure(): ReviewedPackagePreferenceClosure {
  const input = validClosureInput();
  input.artifacts = input.artifacts.filter(
    ({ name }) => name === "sotto-control",
  );
  const packageIds = new Set(
    input.artifacts.flatMap(({ packages }) =>
      packages.map(({ packageId }) => packageId),
    ),
  );
  input.graphPackages = input.graphPackages.filter(({ packageId }) =>
    packageIds.has(packageId),
  );
  input.selectablePackageNames = ["sotto-control"];
  return buildReviewedPackagePreferenceClosure(input);
}

export function historicalSiblingClosure(): ReviewedPackagePreferenceClosure {
  const input = validClosureInput();
  const packageId = "e".repeat(64);
  const name = "splice-amulet";
  const version = "0.1.20";
  input.artifacts.push({
    id: "splice-amulet-0.1.20",
    name,
    version,
    sourcePinId: "splice",
    darSha256: "f".repeat(64),
    mainPackageId: packageId,
    manifestSha256: createHash("sha256")
      .update(`${name}\t${version}\t${packageId}\n`)
      .digest("hex"),
    packages: [{ packageId, name, version }],
  });
  input.graphPackages.push({ packageId, name, version });
  return buildReviewedPackagePreferenceClosure(input);
}

export function liveReferences(
  closure: ReviewedPackagePreferenceClosure,
): Array<{
  packageId: string;
  packageName: string;
  packageVersion: string;
}> {
  return closure.selectablePackageNames.map((packageName) => {
    const entry = closure.graphPackages.find(
      ({ name }) => name === packageName,
    );
    if (entry === undefined)
      throw new Error("test package reference is absent");
    return {
      packageId: entry.packageId,
      packageName: entry.name,
      packageVersion: entry.version,
    };
  });
}

export function observationScope(closure = observationClosure()) {
  return {
    closure,
    synchronizerId: SYNCHRONIZER,
    vettingValidAt: VETTING_VALID_AT,
    payerParty: PAYER,
    agentParty: AGENT,
    providerParty: PROVIDER,
    adminParty: DSO,
  };
}

export function claimScope(closure = observationClosure()) {
  return {
    closure,
    synchronizerId: SYNCHRONIZER,
    vettingValidAt: VETTING_VALID_AT,
    authenticatedSubject: SUBJECT,
  };
}
