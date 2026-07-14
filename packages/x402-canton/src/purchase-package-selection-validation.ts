import { utf8Compare } from "./package-preference-artifact-validation.js";
import { readAuthenticatedPackagePreferenceProjection } from "./package-preference-observation.js";
import { PACKAGE_SELECTION_VERSION } from "./package-preference-observation-types.js";
import {
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import {
  canonicalPackageReferences,
  exactPackageSelectionStringArray,
  packageSelectionSha256,
  rawPackageId,
} from "./purchase-package-selection-primitives.js";
import type {
  CanonicalPurchasePackageSelection,
  PurchasePackageSelectionScope,
} from "./purchase-package-selection-types.js";

export function validatePurchasePackageSelection(
  candidate: unknown,
  scope: PurchasePackageSelectionScope,
): CanonicalPurchasePackageSelection {
  const selection = readAuthenticatedPackagePreferenceProjection(candidate);
  const record = objectValue(selection, "purchase package selection");
  exactKeys(
    record,
    [
      "version",
      "observationId",
      "closureHash",
      "references",
      "packageIds",
      "parties",
      "synchronizerId",
      "vettingValidAt",
      "acquiredAt",
      "authenticatedSubject",
    ],
    "purchase package selection",
  );
  if (record.version !== PACKAGE_SELECTION_VERSION) {
    throw new Error("purchase package selection version is unsupported");
  }
  const references = canonicalPackageReferences(record.references);
  const packageIds = exactPackageSelectionStringArray(
    record.packageIds,
    references.length,
    "package selection IDs",
    rawPackageId,
  );
  if (
    JSON.stringify(packageIds) !==
    JSON.stringify(
      [...references.map(({ packageId }) => packageId)].sort(utf8Compare),
    )
  ) {
    throw new Error("package selection IDs do not match its named references");
  }
  const expectedParties = [
    scope.adminParty,
    scope.agentParty,
    scope.payerParty,
    scope.providerParty,
  ].sort(utf8Compare);
  const parties = exactPackageSelectionStringArray(
    record.parties,
    expectedParties.length,
    "package selection parties",
  );
  if (JSON.stringify(parties) !== JSON.stringify(expectedParties)) {
    throw new Error(
      "package selection parties do not match the purchase scope",
    );
  }
  const synchronizerId = identifier(
    record.synchronizerId,
    "package selection synchronizer",
  );
  if (synchronizerId !== scope.synchronizerId) {
    throw new Error(
      "package selection synchronizer does not match the purchase",
    );
  }
  const acquiredAtMs = canonicalTime(
    record.acquiredAt,
    "package selection acquiredAt",
  );
  const vettingAtMs = canonicalTime(
    record.vettingValidAt,
    "package selection vettingValidAt",
  );
  const observedAtMs = canonicalTime(
    scope.challengeObservedAt,
    "challenge observedAt",
  );
  const executeBeforeMs = canonicalTime(
    scope.executeBefore,
    "challenge expiresAt",
  );
  if (
    acquiredAtMs < observedAtMs ||
    acquiredAtMs > executeBeforeMs ||
    vettingAtMs < acquiredAtMs ||
    vettingAtMs > executeBeforeMs
  ) {
    throw new Error("package selection timing is outside the purchase window");
  }
  const frozenParties = Object.freeze(parties);
  return Object.freeze({
    version: PACKAGE_SELECTION_VERSION,
    observationId: packageSelectionSha256(
      record.observationId,
      "package selection observationId",
    ),
    closureHash: packageSelectionSha256(
      record.closureHash,
      "package selection closureHash",
    ),
    requirements: Object.freeze(
      references.map(({ packageName }) =>
        Object.freeze({ packageName, parties: Object.freeze([...parties]) }),
      ),
    ),
    references,
    packageIds: Object.freeze(packageIds),
    parties: frozenParties,
    synchronizerId,
    vettingValidAt: record.vettingValidAt as string,
    acquiredAt: record.acquiredAt as string,
    authenticatedSubject: identifier(
      record.authenticatedSubject,
      "package selection authenticated subject",
      255,
    ),
  });
}
