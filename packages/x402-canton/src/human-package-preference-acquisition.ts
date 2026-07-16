import { createHash, randomBytes } from "node:crypto";
import {
  HUMAN_PACKAGE_SELECTION_VERSION,
  type AuthenticatedHumanPackagePreference,
  type HumanPackagePreferenceReader,
  type ValidatedHumanPackagePreferenceScope,
} from "./human-package-preference-types.js";
import { requireHumanObservationActive } from "./human-observation-deadline.js";
import { verifyReviewedPackageReferences } from "./package-reference-verifier.js";
import { identifier } from "./purchase-commitment-primitives.js";

async function readUpstream(
  phase: "packages" | "subject",
  read: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await read();
  } catch {
    throw new Error(`human package preference ${phase} read failed`);
  }
}

export async function acquireHumanPackagePreference(
  source: HumanPackagePreferenceReader,
  scope: ValidatedHumanPackagePreferenceScope,
  signal: AbortSignal,
) {
  const readOptions = Object.freeze({ signal });
  const acquisitionStartedAt = Date.now();
  const initialSubject = identifier(
    await readUpstream("subject", () =>
      source.readAuthenticatedSubject(readOptions),
    ),
    "human package authenticated subject",
    256,
  );
  requireHumanObservationActive(signal, "human package preference");
  const response = await readUpstream("packages", () =>
    source.readPackageReferences(
      {
        packageRequirements: Object.freeze([
          Object.freeze({
            packageName: "splice-amulet",
            parties: scope.parties,
          }),
        ]),
        synchronizerId: scope.synchronizerId,
        vettingValidAt: scope.vettingValidAt,
      },
      readOptions,
    ),
  );
  requireHumanObservationActive(signal, "human package preference");
  const finalSubject = identifier(
    await readUpstream("subject", () =>
      source.readAuthenticatedSubject(readOptions),
    ),
    "human package authenticated subject",
    256,
  );
  requireHumanObservationActive(signal, "human package preference");
  if (initialSubject !== finalSubject) {
    throw new Error("human package authenticated subject changed");
  }
  const references = verifyReviewedPackageReferences(scope.closure, response);
  const reference = references[0];
  if (references.length !== 1 || reference?.packageName !== "splice-amulet") {
    throw new Error("human package response must select only splice-amulet");
  }
  const capturedAt = Date.now();
  const acquiredAt = new Date(capturedAt).toISOString();
  const observationId = `sha256:${randomBytes(32).toString("hex")}` as const;
  const projection = Object.freeze({
    acquiredAt,
    closureHash: scope.closure.closureHash,
    observationId,
    packageIds: Object.freeze([reference.packageId]) as readonly [string],
    parties: scope.parties,
    references: Object.freeze([
      Object.freeze({
        artifactIds: Object.freeze([...reference.artifactIds]),
        packageId: reference.packageId,
        packageName: "splice-amulet" as const,
        packageVersion: reference.packageVersion,
      }),
    ]) as AuthenticatedHumanPackagePreference["references"],
    subjectHash: `sha256:${createHash("sha256")
      .update(initialSubject)
      .digest("hex")}` as const,
    synchronizerId: scope.synchronizerId,
    version: HUMAN_PACKAGE_SELECTION_VERSION,
    vettingValidAt: scope.vettingValidAt,
  });
  return Object.freeze({
    acquisitionStartedAt,
    capturedAt,
    observation: Object.freeze({ observationId, observedAt: acquiredAt }),
    projection,
  });
}
