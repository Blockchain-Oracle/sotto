import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildFiveNorthPackagePreferenceManifest } from "../src/five-north-package-preference-manifest.js";
import { APPROVED_SOTTO_CONTROL_DAR_PACKAGES } from "../src/sotto-control-dar-inventory.js";

const sottoDarSha256 =
  "07483431fb6b56b1b609067e72e124afbbc54b6a89ca89f774a90b70bd2d88e8";

function graphUnionHash(
  packages: ReadonlyArray<
    Readonly<{ packageId: string; name: string; version: string }>
  >,
): string {
  const tsv = `${[...packages]
    .sort(({ packageId: left }, { packageId: right }) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    )
    .map(({ packageId, name, version }) => `${packageId}\t${name}\t${version}`)
    .join("\n")}\n`;
  return createHash("sha256").update(tsv).digest("hex");
}

describe("Five North package-preference manifest", () => {
  it("reproduces the reviewed four artifacts and separate two-name closure", () => {
    const closure = buildFiveNorthPackagePreferenceManifest({
      sottoDarSha256,
      sottoSourceCommit: "b".repeat(40),
    });

    expect(closure.selectablePackageNames).toEqual([
      "sotto-control",
      "splice-amulet",
    ]);
    expect(
      closure.artifacts.map(({ name, version, packages }) => [
        name,
        version,
        packages.length,
      ]),
    ).toEqual([
      ["sotto-control", "0.2.0", 35],
      ["splice-amulet", "0.1.20", 41],
      ["splice-amulet", "0.1.21", 51],
      ["splice-amulet", "0.1.9", 37],
    ]);
    expect(closure.graphPackages).toHaveLength(58);
    expect(new Set(closure.graphPackages.map(({ name }) => name)).size).toBe(
      48,
    );
    expect(graphUnionHash(closure.graphPackages)).toBe(
      "94d17e6ef7bf3de3b6d27ae7c889625250ecb1395784ea344dfbde662b86e6bc",
    );
  });

  it("uses the exact approved Sotto inventory instead of a maintained copy", () => {
    const closure = buildFiveNorthPackagePreferenceManifest({
      sottoDarSha256,
      sottoSourceCommit: "b".repeat(40),
    });
    const sotto = closure.artifacts.find(
      ({ name }) => name === "sotto-control",
    );
    expect(
      sotto?.packages.map(({ packageId, name, version }) => [
        packageId,
        name,
        version,
      ]),
    ).toEqual(
      [...APPROVED_SOTTO_CONTROL_DAR_PACKAGES].sort((left, right) =>
        Buffer.compare(
          Buffer.from(`${left[1]}\0${left[2]}\0${left[0]}`),
          Buffer.from(`${right[1]}\0${right[2]}\0${right[0]}`),
        ),
      ),
    );
  });

  it("binds Sotto source and DAR pins into the closure hash", () => {
    const baseline = buildFiveNorthPackagePreferenceManifest({
      sottoDarSha256,
      sottoSourceCommit: "b".repeat(40),
    });
    const sourceMutation = buildFiveNorthPackagePreferenceManifest({
      sottoDarSha256,
      sottoSourceCommit: "c".repeat(40),
    });
    const darMutation = buildFiveNorthPackagePreferenceManifest({
      sottoDarSha256: "d".repeat(64),
      sottoSourceCommit: "b".repeat(40),
    });
    expect(sourceMutation.closureHash).not.toBe(baseline.closureHash);
    expect(darMutation.closureHash).not.toBe(baseline.closureHash);
  });
});
