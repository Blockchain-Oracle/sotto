import { AGENT, PAYER, PROVIDER } from "./purchase-commitment.fixtures.js";
import type { PackageSelectionFixture } from "./purchase-package-selection.fixtures.js";

export type SelectionMutation = (selection: PackageSelectionFixture) => void;

const alternateReference = {
  packageId: "e".repeat(64),
  packageName: "other-package",
  packageVersion: "1.0.0",
  artifactIds: ["other-package-1.0.0"],
};

export const structuralMutations: ReadonlyArray<
  readonly [string, SelectionMutation]
> = [
  ["structural clone", () => undefined],
  ["version", (value) => (value.version = "other")],
  [
    "observation ID",
    (value) => (value.observationId = `sha256:${"0".repeat(64)}`),
  ],
  ["closure hash", (value) => (value.closureHash = `sha256:${"1".repeat(64)}`)],
  ["first package name", (value) => (value.references[0]!.packageName = "x")],
  [
    "first package ID",
    (value) => (value.references[0]!.packageId = "2".repeat(64)),
  ],
  [
    "first package version",
    (value) => (value.references[0]!.packageVersion = "9"),
  ],
  ["first artifact ID", (value) => (value.references[0]!.artifactIds[0] = "x")],
  ["second package name", (value) => (value.references[1]!.packageName = "x")],
  [
    "second package ID",
    (value) => (value.references[1]!.packageId = "2".repeat(64)),
  ],
  [
    "second package version",
    (value) => (value.references[1]!.packageVersion = "9"),
  ],
  [
    "second artifact ID",
    (value) => (value.references[1]!.artifactIds[0] = "x"),
  ],
  ["reference order", (value) => value.references.reverse()],
  ["missing reference", (value) => value.references.pop()],
  [
    "extra unique reference",
    (value) => value.references.push(alternateReference),
  ],
  [
    "duplicate reference",
    (value) => value.references.push(structuredClone(value.references[0]!)),
  ],
  ["package ID order", (value) => value.packageIds.reverse()],
  ["missing package ID", (value) => value.packageIds.pop()],
  ["substituted package ID", (value) => (value.packageIds[0] = "2".repeat(64))],
  ["extra package ID", (value) => value.packageIds.push("3".repeat(64))],
  [
    "duplicate package ID",
    (value) => value.packageIds.push(value.packageIds[0]!),
  ],
  ["parties", (value) => value.parties.pop()],
  ["party order", (value) => value.parties.reverse()],
  ["extra party", (value) => value.parties.push("sotto-other::1220other")],
  ["duplicate party", (value) => value.parties.push(value.parties[0]!)],
  ["substituted party", (value) => (value.parties[0] = "other::1220party")],
  ["synchronizer", (value) => (value.synchronizerId = "other::1220sync")],
  [
    "vetting time",
    (value) => (value.vettingValidAt = "2026-07-13T10:00:31.000Z"),
  ],
  [
    "acquisition time",
    (value) => (value.acquiredAt = "2026-07-13T10:00:00.001Z"),
  ],
  ["authenticated subject", (value) => (value.authenticatedSubject = "other")],
  ["unexpected key", (value) => Object.assign(value, { debug: true })],
];

function substituteParty(
  selection: PackageSelectionFixture,
  current: string,
  replacement: string,
): void {
  selection.parties = selection.parties
    .map((party) => (party === current ? replacement : party))
    .sort();
}

export const authenticInvalidSelections: ReadonlyArray<
  readonly [string, SelectionMutation]
> = [
  [
    "payer",
    (value) => substituteParty(value, PAYER, "sotto-payer-2::1220payer"),
  ],
  [
    "agent",
    (value) => substituteParty(value, AGENT, "sotto-agent-2::1220agent"),
  ],
  [
    "provider",
    (value) =>
      substituteParty(value, PROVIDER, "sotto-provider-2::1220provider"),
  ],
  ["synchronizer", (value) => (value.synchronizerId = "other::1220sync")],
  [
    "vetting before acquisition",
    (value) => (value.vettingValidAt = "2026-07-13T09:59:59.999Z"),
  ],
  [
    "vetting after execution",
    (value) => (value.vettingValidAt = "2026-07-13T10:00:45.001Z"),
  ],
];
