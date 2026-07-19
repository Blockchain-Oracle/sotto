import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { catalogHumanPurchaseIntent } from "../../../packages/database/test/purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrepareAuthorityKeyring,
  testPrivateDeliveryKeyring,
} from "../../../packages/database/test/purchase-postgres.fixtures.js";
import { purchaseBindingResolver } from "../../../packages/database/test/purchase-journal.fixtures.js";

// Real composition boot: apps/worker/dist/main.js runs against a disposable
// PostgreSQL database while every Five North and signer endpoint points at
// an unreachable loopback port. Loops must surface operational errors and
// keep restarting; nothing here simulates payment or settlement.
const UNREACHABLE = "https://127.0.0.1:9";
const SOURCE_COMMIT = "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56";
const LEASE_OWNER = "worker-boot-test";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;
let child: ChildProcess | undefined;
let stdout = "";

function workerEnvironment(databaseUrl: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    DATABASE_URL: databaseUrl,
    WORKER_LEASE_OWNER: LEASE_OWNER,
    PREPARE_AUTHORITY_KEY: `prepare-key-2026-07:${Buffer.alloc(32, 7).toString("base64")}`,
    DELIVERY_KEY: `delivery-key-2026-07:${Buffer.alloc(32, 13).toString("base64")}`,
    SIGNER_SERVICE_URL: "http://127.0.0.1:9",
    SIGNER_SERVICE_TOKEN: "worker-boot-token",
    SOURCE_COMMIT,
    FIVE_NORTH_OIDC_AUDIENCE: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_ID: "validator-devnet-m2m",
    FIVE_NORTH_OIDC_CLIENT_SECRET: "worker-boot-secret",
    FIVE_NORTH_OIDC_ISSUER_URL: `${UNREACHABLE}/issuer`,
    FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
    FIVE_NORTH_OIDC_TOKEN_URL: `${UNREACHABLE}/token/`,
    FIVE_NORTH_LEDGER_URL: UNREACHABLE,
    FIVE_NORTH_VALIDATOR_URL: `${UNREACHABLE}/api/validator`,
  };
}

async function heartbeatRows(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      workerId: string;
      kind: string;
      sourceCommit: string;
      beatAt: Date;
    }>(
      `SELECT worker_id AS "workerId", kind, source_commit AS "sourceCommit",
              beat_at AS "beatAt"
       FROM sotto.worker_heartbeats`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

async function waitFor<T>(
  label: string,
  read: () => Promise<T | undefined>,
  timeoutMilliseconds: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await delay(250);
  }
  throw new Error(`worker boot test timed out waiting for ${label}`);
}

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_worker_boot_test");
  // A queued human purchase forces the prepare loop onto the unreachable
  // network so restart behavior is observable, not hypothetical.
  const purchase = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    sourceCommit: SOURCE_COMMIT,
    resolveHumanPurchaseBinding: purchaseBindingResolver(),
  });
  try {
    await purchase.initializeHumanPurchaseAttempt(
      await catalogHumanPurchaseIntent(),
    );
  } finally {
    await purchase.close();
  }
});

afterAll(async () => {
  if (child !== undefined && child.exitCode === null) child.kill("SIGKILL");
  await context?.database.drop();
});

it("boots the composed worker, heartbeats, survives dead networks, and drains on SIGTERM", async () => {
  const mainModule = new URL("../dist/main.js", import.meta.url).pathname;
  child = spawn(process.execPath, [mainModule], {
    env: workerEnvironment(context.database.databaseUrl),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  const exited = new Promise<number | null>((resolve) =>
    child?.once("exit", (code) => resolve(code)),
  );

  const heartbeat = await waitFor(
    "the first heartbeat row",
    async () => {
      if (child?.exitCode !== null) {
        throw new Error(`worker exited early:\n${stdout}`);
      }
      const rows = await heartbeatRows(context.database.databaseUrl);
      return rows.length > 0 ? rows[0] : undefined;
    },
    30_000,
  );
  expect(heartbeat).toMatchObject({
    workerId: LEASE_OWNER,
    kind: "sotto-worker",
    sourceCommit: SOURCE_COMMIT,
  });

  await waitFor(
    "an operational prepare-loop error",
    async () =>
      stdout.includes('"code":"WORKER_LOOP_ERROR"') &&
      stdout.includes('"loop":"human-prepare"')
        ? true
        : undefined,
    30_000,
  );
  expect(child.exitCode).toBeNull();

  const laterBeat = await waitFor(
    "a later heartbeat",
    async () => {
      const rows = await heartbeatRows(context.database.databaseUrl);
      const beat = rows[0]?.beatAt;
      return beat !== undefined && beat.getTime() > heartbeat.beatAt.getTime()
        ? beat
        : undefined;
    },
    30_000,
  );
  expect(laterBeat.getTime()).toBeGreaterThan(heartbeat.beatAt.getTime());

  child.kill("SIGTERM");
  await expect(exited).resolves.toBe(0);
  expect(stdout).toContain('"code":"WORKER_STOPPED"');
});
