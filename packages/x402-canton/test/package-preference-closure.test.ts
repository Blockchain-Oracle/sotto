import { beforeAll, describe, expect, it } from "vitest";
import {
  type ClosureInput,
  INVALID_CLOSURE_MUTATIONS,
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
        "sha256:4a1bcf39aac8d5232b1e6e4caee93a39a3022a2ff235e13574e5d91c61cd299d",
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
      "sha256:4a1bcf39aac8d5232b1e6e4caee93a39a3022a2ff235e13574e5d91c61cd299d",
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.artifacts[0])).toBe(true);
    expect(Object.isFrozen(result.artifacts[0]?.packages)).toBe(true);
    expect(Object.isFrozen(result.artifacts[0]?.packages[0])).toBe(true);
    expect(Object.isFrozen(result.graphPackages[0]?.artifactIds)).toBe(true);
    const callerBytes = result.canonicalBytes;
    callerBytes.fill(0);
    expect(new TextDecoder().decode(result.canonicalBytes)).toContain(
      '"version":"sotto-package-closure-v1"',
    );
  });

  it.each(INVALID_CLOSURE_MUTATIONS)(
    "rejects %s before it can become authority",
    (_label, mutate) => {
      const input = validClosureInput();
      mutate(input);
      expect(() =>
        subject.buildReviewedPackagePreferenceClosure(input),
      ).toThrow();
    },
  );

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
