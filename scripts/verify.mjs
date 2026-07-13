import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function run(label, command, args, options = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(command, args, env) {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const pnpmScript = process.env.npm_execpath;
const pnpm = pnpmScript ? [process.execPath, [pnpmScript]] : ["pnpm", []];
const runPnpm = (label, ...args) => run(label, pnpm[0], [...pnpm[1], ...args]);

runPnpm("toolchain", "check:toolchain");
runPnpm("format", "format:check");
runPnpm("lint", "lint");
runPnpm("build", "build");
runPnpm("typecheck", "typecheck");
runPnpm("unit tests", "test:unit");
for (const check of [
  "check:files",
  "check:source",
  "check:contamination",
  "check:claims",
  "check:context",
  "check:env",
  "check:licenses",
]) {
  runPnpm(check, check);
}
runPnpm("secret scan", "exec", "secretlint", "**/*");
runPnpm("dependency audit", "audit", "--audit-level", "high");

const homeDpm = join(homedir(), ".dpm", "bin", "dpm");
const dpm = existsSync(homeDpm) ? homeDpm : "dpm";
const javaHome =
  process.env.JAVA_HOME ??
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
const toolEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${dirname(dpm)}:${join(javaHome, "bin")}:${process.env.PATH ?? ""}`,
};
const sdkVersion = capture(dpm, ["version", "--active"], toolEnv);
if (sdkVersion !== "3.5.2") {
  throw new Error(`Expected Daml SDK 3.5.2, got ${sdkVersion}`);
}
run("Daml build", dpm, ["build", "--all"], { cwd: "daml", env: toolEnv });
run("Daml tests", dpm, ["test"], {
  cwd: "daml/sotto-control-tests",
  env: toolEnv,
});
run("whitespace", "git", ["diff", "--check"]);
process.stdout.write("\nAll deterministic workspace gates passed.\n");
