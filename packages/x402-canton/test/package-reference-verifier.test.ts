import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildReviewedPackagePreferenceClosure } from "../src/package-preference-closure.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";

type LiveReference = {
  packageId: string;
  packageName: string;
  packageVersion: string;
};
type VerifiedReference = Readonly<
  LiveReference & { artifactIds: ReadonlyArray<string> }
>;
type Subject = {
  verifyReviewedPackageReferences(
    closure: unknown,
    references: unknown,
  ): ReadonlyArray<VerifiedReference>;
};

const historicalPackageId = "e".repeat(64);

function manifestHash(
  packageId: string,
  name: string,
  version: string,
): string {
  return createHash("sha256")
    .update(`${name}\t${version}\t${packageId}\n`)
    .digest("hex");
}

function closureWithHistory() {
  const input = validClosureInput();
  input.artifacts.push({
    id: "splice-amulet-0.1.20",
    name: "splice-amulet",
    version: "0.1.20",
    sourcePinId: "splice",
    darSha256: "f".repeat(64),
    mainPackageId: historicalPackageId,
    manifestSha256: manifestHash(
      historicalPackageId,
      "splice-amulet",
      "0.1.20",
    ),
    packages: [
      {
        packageId: historicalPackageId,
        name: "splice-amulet",
        version: "0.1.20",
      },
    ],
  });
  input.graphPackages.push({
    packageId: historicalPackageId,
    name: "splice-amulet",
    version: "0.1.20",
  });
  return buildReviewedPackagePreferenceClosure(input);
}

function reference(
  closure: ReturnType<typeof closureWithHistory>,
  version: string,
): LiveReference {
  const entry = closure.graphPackages.find(
    ({ name, version: candidate }) =>
      name === "splice-amulet" && candidate === version,
  );
  if (entry === undefined) throw new Error("test reference is unavailable");
  return {
    packageId: entry.packageId,
    packageName: entry.name,
    packageVersion: entry.version,
  };
}

let subject: Subject;
beforeAll(async () => {
  const subjectPath = "../src/package-reference-verifier.js";
  try {
    subject = (await import(subjectPath)) as Subject;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("package-reference-verifier")
    ) {
      throw new Error("PACKAGE_REFERENCE_VERIFIER_NOT_IMPLEMENTED", {
        cause: error,
      });
    }
    throw error;
  }
});

describe("independent package-reference verification", () => {
  it("accepts exact current and historical artifact references", () => {
    const closure = closureWithHistory();
    const references = [
      reference(closure, "0.1.21"),
      reference(closure, "0.1.20"),
    ];
    const result = subject.verifyReviewedPackageReferences(closure, references);
    references[0]!.packageName = "mutated";
    expect(result.map(({ packageVersion }) => packageVersion)).toEqual([
      "0.1.20",
      "0.1.21",
    ]);
    expect(result[0]?.artifactIds).toEqual(["splice-amulet-0.1.20"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0]?.artifactIds)).toBe(true);
  });

  it.each<readonly [string, (refs: LiveReference[]) => void]>([
    ["empty references", (refs) => refs.splice(0)],
    ["sparse references", (refs) => (refs.length += 1)],
    ["duplicate IDs", (refs) => refs.push(refs[0]!)],
    ["unknown ID", (refs) => (refs[0]!.packageId = "d".repeat(64))],
    ["reused name", (refs) => (refs[0]!.packageName = "sotto-control")],
    ["reused version", (refs) => (refs[0]!.packageVersion = "0.1.9")],
    [
      "caller provenance",
      (refs) => Object.assign(refs[0]!, { artifactIds: ["caller"] }),
    ],
  ])("rejects %s", (_label, mutate) => {
    const closure = closureWithHistory();
    const references = [reference(closure, "0.1.21")];
    mutate(references);
    expect(() =>
      subject.verifyReviewedPackageReferences(closure, references),
    ).toThrow();
  });

  it("rejects caller-constructed closure provenance", () => {
    const closure = closureWithHistory();
    expect(() =>
      subject.verifyReviewedPackageReferences({ ...closure }, [
        reference(closure, "0.1.21"),
      ]),
    ).toThrow();
  });
});
