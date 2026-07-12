import { readFileSync } from "node:fs";

const expected = {
  dpm: "1.0.21",
  java: "21.0.11",
  node: "24.18.0",
  packageManager: "pnpm@11.12.0",
  sdk: "3.5.2",
};

function exactFile(path) {
  return readFileSync(path, "utf8").trim();
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const pnpmVersion =
  process.env.npm_config_user_agent?.match(/pnpm\/([^\s]+)/)?.[1];
const manifests = [
  "daml/sotto-control/daml.yaml",
  "daml/sotto-control-tests/daml.yaml",
];

const failures = [
  [process.versions.node, expected.node, "Node"],
  [pnpmVersion, "11.12.0", "pnpm"],
  [packageJson.packageManager, expected.packageManager, "packageManager"],
  [exactFile(".node-version"), expected.node, ".node-version"],
  [exactFile(".java-version"), expected.java, ".java-version"],
  [exactFile(".dpm-version"), expected.dpm, ".dpm-version"],
  ...manifests.map((path) => [
    readFileSync(path, "utf8").match(/^sdk-version: (.+)$/m)?.[1],
    expected.sdk,
    path,
  ]),
].filter(([actual, wanted]) => actual !== wanted);

if (failures.length > 0) {
  throw new Error(
    failures
      .map(
        ([actual, wanted, label]) =>
          `${label}: expected ${wanted}, got ${actual}`,
      )
      .join("\n"),
  );
}
process.stdout.write("toolchain pins verified\n");
