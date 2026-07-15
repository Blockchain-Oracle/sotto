import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SDK_NAME = "@canton-network/wallet-sdk";
const SDK_VERSION = "1.4.0";
const SDK_INTEGRITY =
  "sha512-uskdurYd9HgNSXisFUHFkpEFnZTusd0XJ4oBIDnyI2DrM+9TfJk1Z/s2qF1+J2f6B6OswE3oHwyjY39tyXLURg==";
const SDK_REPOSITORY = "git+https://github.com/canton-network/wallet.git";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function lockfileBlock(lockfile: string, heading: string): string {
  const start = lockfile.indexOf(heading);
  if (start < 0) throw new Error(`lockfile heading is absent: ${heading}`);
  const remaining = lockfile.slice(start + heading.length);
  const next = remaining.search(/\n {2}\S/u);
  return lockfile.slice(
    start,
    next < 0 ? undefined : start + heading.length + next,
  );
}

function installedSdkManifest(): Record<string, unknown> {
  let path = createRequire(import.meta.url).resolve(SDK_NAME);
  while (dirname(path) !== path) {
    const candidate = join(dirname(path), "package.json");
    try {
      const manifest = readJson(candidate);
      if (manifest.name === SDK_NAME) return manifest;
    } catch {
      // Continue to the package root.
    }
    path = dirname(path);
  }
  throw new Error("installed Canton Wallet SDK manifest is absent");
}

describe("Canton Wallet SDK provenance", () => {
  it("pins the exact licensed reference SDK and workspace boundary", () => {
    const manifest = readJson(
      join(workspaceRoot, "spikes/capability-wallet/package.json"),
    );

    expect(manifest).toMatchObject({
      name: "@sotto/capability-wallet",
      private: true,
      license: "Apache-2.0",
      dependencies: {
        [SDK_NAME]: SDK_VERSION,
        "@sotto/x402-canton": "workspace:*",
      },
      scripts: {
        build: "tsc -p tsconfig.build.json",
        test: "vitest run test",
      },
    });
  });

  it("locks the exact npm artifact integrity", () => {
    const lockfile = readFileSync(
      join(workspaceRoot, "pnpm-lock.yaml"),
      "utf8",
    );
    const importer = lockfileBlock(lockfile, "  spikes/capability-wallet:");
    const artifactHeading = `  '${SDK_NAME}@${SDK_VERSION}':`;
    const artifact = lockfileBlock(lockfile, artifactHeading);

    expect(importer).toContain(
      `'${SDK_NAME}':\n        specifier: ${SDK_VERSION}`,
    );
    expect(importer).toContain(
      "'@sotto/x402-canton':\n        specifier: workspace:*\n        version: link:../../packages/x402-canton",
    );
    expect(artifact.trimEnd().split("\n")).toEqual([
      artifactHeading,
      `    resolution: {integrity: ${SDK_INTEGRITY}}`,
    ]);
  });

  it("retains the official Apache-2.0 source repository metadata", () => {
    const manifest = installedSdkManifest();

    expect(manifest).toMatchObject({
      name: SDK_NAME,
      version: SDK_VERSION,
      license: "Apache-2.0",
      repository: {
        type: "git",
        url: SDK_REPOSITORY,
        directory: "sdk/wallet-sdk",
      },
    });
  });
});
