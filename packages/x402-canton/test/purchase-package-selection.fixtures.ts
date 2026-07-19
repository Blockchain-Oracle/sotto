import type { BoundedPurchaseCommitmentInput } from "../src/index.js";
import { vi } from "vitest";
import * as packagePreferenceObservation from "../src/package-preference-observation.js";
import { PACKAGE_SELECTION_VERSION } from "../src/package-preference-observation-types.js";
import { observationClosure } from "./package-preference-observation.fixtures.js";
import {
  AGENT,
  PAYER,
  PROVIDER,
  createPurchaseInput,
} from "./purchase-commitment.fixtures.js";

export type PackageSelectionFixture = {
  version: string;
  observationId: string;
  closureHash: string;
  references: Array<{
    packageId: string;
    packageName: string;
    packageVersion: string;
    artifactIds: string[];
  }>;
  packageIds: string[];
  parties: string[];
  synchronizerId: string;
  vettingValidAt: string;
  acquiredAt: string;
  authenticatedSubject: string;
};

export type PurchaseV3Input = BoundedPurchaseCommitmentInput & {
  packageSelection: PackageSelectionFixture;
};

export const PURCHASE_V3_NOW = "2026-07-13T10:00:00.000Z";

type TestProjectionRecorder = (
  input: PackageSelectionFixture,
) => PackageSelectionFixture;

const preferenceTestModule = packagePreferenceObservation as unknown as {
  capturePackagePreferenceProjectionForTest?: TestProjectionRecorder;
};

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function rawPackageSelection(
  observationId = `sha256:${"8".repeat(64)}`,
): PackageSelectionFixture {
  const closure = observationClosure();
  const references = closure.selectablePackageNames.map((packageName) => {
    const reference = closure.graphPackages.find(
      ({ name }) => name === packageName,
    );
    if (reference === undefined) {
      throw new Error("test package selection reference is absent");
    }
    return {
      packageId: reference.packageId,
      packageName: reference.name,
      packageVersion: reference.version,
      artifactIds: [...reference.artifactIds],
    };
  });
  return {
    version: PACKAGE_SELECTION_VERSION,
    observationId,
    closureHash: closure.closureHash,
    references,
    packageIds: references.map(({ packageId }) => packageId).sort(utf8Compare),
    parties: [AGENT, PAYER, PROVIDER].sort(utf8Compare),
    synchronizerId: "global-domain::1220sync",
    vettingValidAt: "2026-07-13T10:00:30.000Z",
    acquiredAt: "2026-07-13T10:00:00.000Z",
    authenticatedSubject: "validator-devnet-m2m",
  };
}

export function createPackageSelectionFixture(
  observationId?: string,
  mutate: (selection: PackageSelectionFixture) => void = () => undefined,
): PackageSelectionFixture {
  const selection = rawPackageSelection(observationId);
  mutate(selection);
  const record = preferenceTestModule.capturePackagePreferenceProjectionForTest;
  return record === undefined ? selection : record(selection);
}

export function createPurchaseV3Input(
  packageSelection = createPackageSelectionFixture(),
): PurchaseV3Input {
  return createPurchaseInput(packageSelection) as PurchaseV3Input;
}

export function expectedCanonicalPackageSelection(
  selection: PackageSelectionFixture,
) {
  return {
    version: selection.version,
    observationId: selection.observationId,
    closureHash: selection.closureHash,
    requirements: selection.references.map(({ packageName }) => ({
      packageName,
      parties: selection.parties,
    })),
    references: selection.references,
    packageIds: selection.packageIds,
    parties: selection.parties,
    synchronizerId: selection.synchronizerId,
    vettingValidAt: selection.vettingValidAt,
    acquiredAt: selection.acquiredAt,
    authenticatedSubject: selection.authenticatedSubject,
  };
}

export function mutatePackageSelection(
  input: PurchaseV3Input,
  mutate: (selection: PackageSelectionFixture) => void,
): PurchaseV3Input {
  const packageSelection = structuredClone(input.packageSelection);
  mutate(packageSelection);
  return { ...input, packageSelection };
}

export function replacePackageSelection(
  input: BoundedPurchaseCommitmentInput,
  mutate: (selection: PackageSelectionFixture) => void,
): BoundedPurchaseCommitmentInput {
  return {
    ...input,
    packageSelection: createPackageSelectionFixture(
      undefined,
      mutate,
    ) as unknown as BoundedPurchaseCommitmentInput["packageSelection"],
  };
}

export async function withPurchaseV3Clock<T>(
  run: () => T | Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ now: new Date(PURCHASE_V3_NOW) });
  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
}
