import { beforeAll, describe, expect, it } from "vitest";
import {
  damlPrimB,
  type ClosureInput,
  type PackageEntry,
  validClosureInput,
} from "./package-preference-closure.fixtures.js";
type ClosureResult = {
  version: string;
  closureHash: string;
  canonicalBytes: Uint8Array;
  sourcePins: ReadonlyArray<Readonly<ClosureInput["sourcePins"][number]>>;
  artifacts: ReadonlyArray<
    Readonly<ClosureInput["artifacts"][number]> & {
      packages: ReadonlyArray<Readonly<PackageEntry>>;
    }
  >;
  selectablePackageNames: ReadonlyArray<string>;
  graphPackages: ReadonlyArray<
    Readonly<PackageEntry & { artifactIds: ReadonlyArray<string> }>
  >;
};
type Subject = {
  PACKAGE_PREFERENCE_CLOSURE_VERSION: string;
  buildReviewedPackagePreferenceClosure(input: ClosureInput): ClosureResult;
};

let subject: Subject;

beforeAll(async () => {
  const subjectPath = "../src/package-preference-closure.js";
  try {
    subject = (await import(subjectPath)) as Subject;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("package-preference-closure")
    ) {
      throw new Error("PACKAGE_CLOSURE_NOT_IMPLEMENTED", { cause: error });
    }
    throw error;
  }
});

describe("reviewed package-preference closure", () => {
  it("pins canonical bytes while preserving repeated manifest names", () => {
    const result =
      subject.buildReviewedPackagePreferenceClosure(validClosureInput());
    expect(subject.PACKAGE_PREFERENCE_CLOSURE_VERSION).toBe(
      "sotto-package-closure-v1",
    );
    expect(result).toMatchObject({
      version: "sotto-package-closure-v1",
      closureHash:
        "sha256:b1ca640a9ab96fe788a1de269595102495d4f5f9954a6bacc460d8975c73aeb3",
      selectablePackageNames: ["sotto-control", "splice-amulet"],
    });
    expect(
      result.graphPackages.filter(({ name }) => name === "daml-prim"),
    ).toHaveLength(2);
    expect(result.graphPackages[0]?.artifactIds).toEqual([
      "sotto-control-0.2.0",
      "splice-amulet-0.1.21",
    ]);
    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(
      JSON.stringify({
        version: result.version,
        sourcePins: result.sourcePins,
        artifacts: result.artifacts,
        selectablePackageNames: result.selectablePackageNames,
        graphPackages: result.graphPackages,
      }),
    );
  });

  it("is input-order independent, deeply frozen, and detached from callers", () => {
    const input = validClosureInput();
    input.sourcePins.reverse();
    input.artifacts.reverse();
    input.artifacts.forEach(({ packages }) => packages.reverse());
    input.selectablePackageNames.reverse();
    input.graphPackages.reverse();
    const result = subject.buildReviewedPackagePreferenceClosure(input);
    input.sourcePins[0]!.commit = "c".repeat(40);
    expect(result.closureHash).toBe(
      "sha256:b1ca640a9ab96fe788a1de269595102495d4f5f9954a6bacc460d8975c73aeb3",
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.artifacts[0]?.packages)).toBe(true);
    expect(Object.isFrozen(result.graphPackages[0]?.artifactIds)).toBe(true);
  });

  it.each([
    ["version", (input: ClosureInput) => (input.version = "v2")],
    ["source pins", (input: ClosureInput) => (input.sourcePins = [])],
    ["artifacts", (input: ClosureInput) => (input.artifacts = [])],
    [
      "selectable names",
      (input: ClosureInput) => (input.selectablePackageNames = []),
    ],
    ["graph packages", (input: ClosureInput) => (input.graphPackages = [])],
    [
      "unpinned source",
      (input: ClosureInput) => (input.artifacts[0]!.sourcePinId = "missing"),
    ],
    [
      "floating commit",
      (input: ClosureInput) => (input.sourcePins[0]!.commit = "main"),
    ],
    [
      "DAR digest",
      (input: ClosureInput) => (input.artifacts[0]!.darSha256 = "bad"),
    ],
    [
      "manifest digest",
      (input: ClosureInput) => (input.artifacts[0]!.manifestSha256 = "bad"),
    ],
    [
      "missing main package",
      (input: ClosureInput) => (input.artifacts[0]!.mainPackageId = damlPrimB),
    ],
    [
      "duplicate source",
      (input: ClosureInput) => input.sourcePins.push(input.sourcePins[0]!),
    ],
    [
      "duplicate artifact",
      (input: ClosureInput) => input.artifacts.push(input.artifacts[0]!),
    ],
    [
      "duplicate selectable name",
      (input: ClosureInput) =>
        input.selectablePackageNames.push("sotto-control"),
    ],
    [
      "duplicate graph ID",
      (input: ClosureInput) =>
        input.graphPackages.push(input.graphPackages[0]!),
    ],
    [
      "conflicting graph ID",
      (input: ClosureInput) =>
        input.graphPackages.push({ ...input.graphPackages[0]!, name: "other" }),
    ],
    [
      "orphan graph tuple",
      (input: ClosureInput) =>
        (input.graphPackages[0]!.packageId = "f".repeat(64)),
    ],
  ])("rejects %s before it can become authority", (_label, mutate) => {
    const input = validClosureInput();
    mutate(input);
    expect(() =>
      subject.buildReviewedPackagePreferenceClosure(input),
    ).toThrow();
  });

  it("changes the closure hash for valid source or DAR pin mutations", () => {
    const sourceMutation = validClosureInput();
    sourceMutation.sourcePins[0]!.commit = "c".repeat(40);
    const darMutation = validClosureInput();
    darMutation.artifacts[0]!.darSha256 = "d".repeat(64);
    const baseline =
      subject.buildReviewedPackagePreferenceClosure(validClosureInput());
    expect(
      subject.buildReviewedPackagePreferenceClosure(sourceMutation).closureHash,
    ).not.toBe(baseline.closureHash);
    expect(
      subject.buildReviewedPackagePreferenceClosure(darMutation).closureHash,
    ).not.toBe(baseline.closureHash);
  });
});
