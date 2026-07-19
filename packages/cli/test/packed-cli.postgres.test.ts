import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HARNESS_PARTY,
  startApiPostgresHarness,
  type ApiPostgresHarness,
} from "../../../apps/api/test/api-postgres.fixture.js";
import { createSessionRepository } from "../../../apps/api/src/auth/session-repository.js";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");

let harness: ApiPostgresHarness;
let apiOrigin: string;
let sessionToken: string;
let installDir: string;
let binPath: string;

// Async spawn: the API harness lives in this vitest process, so a blocking
// spawnSync would deadlock the very server the CLI calls.
function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      env: { PATH: process.env.PATH ?? "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolvePromise({ status, stdout, stderr });
    });
  });
}

beforeAll(async () => {
  harness = await startApiPostgresHarness("sotto_packed_cli");
  const address = harness.server.server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("API harness reported no address");
  }
  apiOrigin = `http://127.0.0.1:${address.port}`;
  const sessions = createSessionRepository(harness.pool);
  sessionToken = (await sessions.createSession({ partyId: HARNESS_PARTY }))
    .token;

  // Pack the real publishable artifact and install it into a bare project.
  installDir = mkdtempSync(join(tmpdir(), "sotto-packed-cli-"));
  const pack = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", installDir],
    { cwd: PACKAGE_DIR, encoding: "utf8", timeout: 120_000 },
  );
  if (pack.status !== 0) {
    throw new Error(`npm pack failed: ${pack.stderr}`);
  }
  const packed = JSON.parse(pack.stdout) as ReadonlyArray<{ filename: string }>;
  const tarball = join(installDir, packed[0]!.filename);
  writeFileSync(
    join(installDir, "package.json"),
    JSON.stringify({ name: "sotto-packed-e2e", private: true }),
  );
  const install = spawnSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball],
    { cwd: installDir, encoding: "utf8", timeout: 120_000 },
  );
  if (install.status !== 0) {
    throw new Error(
      `npm install of the packed tarball failed: ${install.stderr}`,
    );
  }
  binPath = join(installDir, "node_modules", "@sotto", "cli", "dist", "bin.js");
  expect(
    readdirSync(join(installDir, "node_modules", "@sotto", "cli")),
  ).toContain("dist");
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

describe("packed @usesotto/cli against a real API + PostgreSQL", () => {
  it("reports its version from the installed tarball", async () => {
    const result = await runCli(["--version"], {});
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  it("searches the real catalog and returns the persisted listing", async () => {
    const result = await runCli(["search", "--json"], {
      SOTTO_API_ORIGIN: apiOrigin,
      SOTTO_CONFIG_DIR: join(installDir, "config"),
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      resources: Array<{ listingId: string }>;
    };
    expect(parsed.resources.map((resource) => resource.listingId)).toEqual([
      harness.listingId,
    ]);
  });

  it("answers an honest empty result for a query nothing matches", async () => {
    const result = await runCli(["search", "no-such-resource-xyz", "--json"], {
      SOTTO_API_ORIGIN: apiOrigin,
      SOTTO_CONFIG_DIR: join(installDir, "config"),
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ resources: [] });
  });

  it("authenticates with the bearer session token end to end", async () => {
    const result = await runCli(["whoami", "--json"], {
      SOTTO_API_ORIGIN: apiOrigin,
      SOTTO_SESSION_TOKEN: sessionToken,
      SOTTO_CONFIG_DIR: join(installDir, "config"),
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      apiOrigin,
      tokenConfigured: true,
      tokenSource: "env",
      sessionValid: true,
    });
    expect(result.stdout).not.toContain(sessionToken);
  });
});
