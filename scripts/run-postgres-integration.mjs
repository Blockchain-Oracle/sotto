import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const POSTGRES_IMAGE =
  "postgres:18.4-bookworm@sha256:1961f96e6029a02c3812d7cb329a3b03a3ac2bb067058dec17b0f5596aca9296";
const database = "sotto_test";
const username = "sotto_test";
const password = randomBytes(24).toString("hex");
const containerName = `sotto-postgres-${process.pid}-${randomBytes(4).toString("hex")}`;
const postgresTests = [
  ["packages/database/test", "../packages/database/test/"],
  ["packages/purchase-worker/test", "../packages/purchase-worker/test/"],
]
  .flatMap(([prefix, path]) =>
    readdirSync(new URL(path, import.meta.url), { withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && entry.name.endsWith(".postgres.test.ts"),
      )
      .map((entry) => `${prefix}/${entry.name}`),
  )
  .sort();
if (postgresTests.length === 0) {
  throw new Error("PostgreSQL integration tests are absent");
}
let containerId;

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: options.timeout ?? 15_000,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `Docker command failed: ${result.stderr.trim() || "unknown error"}`,
    );
  }
  return { status: result.status, stdout: result.stdout.trim() };
}

function cleanup() {
  if (containerId === undefined) return;
  docker(["rm", "--force", containerId], {
    allowFailure: true,
    timeout: 20_000,
  });
  containerId = undefined;
}

function interrupt(exitCode) {
  cleanup();
  process.exit(exitCode);
}

process.once("SIGINT", () => interrupt(130));
process.once("SIGTERM", () => interrupt(143));

async function waitUntilReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const ready = docker(
      [
        "exec",
        containerId,
        "pg_isready",
        "--host",
        "127.0.0.1",
        "--username",
        username,
        "--dbname",
        database,
      ],
      { allowFailure: true },
    );
    if (ready.status === 0) return;
    await delay(250);
  }
  throw new Error("PostgreSQL integration container did not become ready");
}

function mappedPort() {
  const output = docker(["port", containerId, "5432/tcp"]).stdout;
  const match = /:(\d+)$/u.exec(output);
  if (match?.[1] === undefined) {
    throw new Error("PostgreSQL integration port mapping is invalid");
  }
  return match[1];
}

async function main() {
  docker(["version", "--format", "{{.Server.Version}}"]);
  containerId = docker(
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--label",
      "com.sotto.integration=postgres",
      "--env",
      `POSTGRES_DB=${database}`,
      "--env",
      `POSTGRES_USER=${username}`,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      "--publish",
      "127.0.0.1::5432",
      POSTGRES_IMAGE,
    ],
    { timeout: 300_000 },
  ).stdout;
  await waitUntilReady();

  const configuredImage = docker([
    "inspect",
    "--format",
    "{{.Config.Image}}",
    containerId,
  ]).stdout;
  if (configuredImage !== POSTGRES_IMAGE) {
    throw new Error("PostgreSQL integration image lost its digest pin");
  }

  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript === undefined) {
    throw new Error("PostgreSQL integration must run through pinned pnpm");
  }
  const testEnvironment = {
    ...process.env,
    SOTTO_TEST_DATABASE_URL: `postgresql://${username}:${password}@127.0.0.1:${mappedPort()}/${database}`,
    SOTTO_TEST_POSTGRES_IMAGE: POSTGRES_IMAGE,
  };
  delete testEnvironment.DATABASE_URL;
  const test = spawnSync(
    process.execPath,
    [
      pnpmScript,
      "exec",
      "vitest",
      "run",
      ...postgresTests,
      "--testTimeout=120000",
      "--hookTimeout=120000",
      "--maxWorkers=1",
    ],
    { env: testEnvironment, stdio: "inherit", timeout: 150_000 },
  );
  if (test.error !== undefined) throw test.error;
  process.exitCode = test.status ?? 1;
}

try {
  await main();
} finally {
  cleanup();
}
