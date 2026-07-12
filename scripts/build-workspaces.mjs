import { spawnSync } from "node:child_process";

const pnpmScript = process.env.npm_execpath;
if (pnpmScript === undefined) {
  throw new Error("Build must run through the pinned pnpm package manager");
}

const result = spawnSync(
  process.execPath,
  [pnpmScript, "--recursive", "--workspace-concurrency=1", "build"],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
