import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepository,
  CatalogRepositoryInput,
  OriginProofInput,
  ProviderOriginRegistration,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let createRepository: (input: CatalogRepositoryInput) => CatalogRepository;

const registration: ProviderOriginRegistration = {
  registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b95100",
  ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b95101",
  ownerPartyId: "sotto-publication-lifecycle::1220owner",
  providerId: "018f3f24-7d4a-7e2c-a421-0f3473b95102",
  providerDisplayName: "Publication lifecycle provider",
  originId: "018f3f24-7d4a-7e2c-a421-0f3473b95103",
  originUrl: "https://publication-lifecycle.example.com/",
};

const proof: OriginProofInput = {
  proofId: "018f3f24-7d4a-7e2c-a421-0f3473b95104",
  ownerId: registration.ownerId,
  originId: registration.originId,
  proofRevision: 1,
  challengeHash: `sha256:${"1".repeat(64)}`,
  evidenceHash: `sha256:${"2".repeat(64)}`,
  verifiedAt: "2026-07-18T00:00:00.000Z",
  expiresAt: "2099-07-18T00:00:00.000Z",
};

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_publication_lifecycle_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const runtime = (await import(/* @vite-ignore */ moduleUrl)) as {
    applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
    createCatalogRepository(input: CatalogRepositoryInput): CatalogRepository;
  };
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
  createRepository = runtime.createCatalogRepository;
});

afterAll(async () => database?.drop());

async function waitForLock(client: Client, applicationName: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query(
      `SELECT 1 FROM pg_stat_activity
       WHERE application_name = $1 AND pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'`,
      [applicationName],
    );
    if (result.rowCount === 1) return;
    await delay(10);
  }
  throw new Error("publication backend lock was not observed");
}

it("drains a blocked publication write and rejects new work", async () => {
  const applicationName = "sotto-publication-drain-test";
  const repository = createRepository({
    databaseUrl: database.databaseUrl,
    maxConnections: 1,
    applicationName,
  });
  const observer = new Client({ connectionString: database.databaseUrl });
  await observer.connect();
  let operation: Promise<unknown> | undefined;
  let closing: Promise<void> | undefined;
  try {
    await repository.registerProviderOrigin(registration);
    await observer.query("BEGIN");
    await observer.query(
      "LOCK TABLE sotto.origin_proofs IN ACCESS EXCLUSIVE MODE",
    );
    operation = repository.recordOriginProof(proof);
    void operation.catch(() => undefined);
    await waitForLock(observer, applicationName);
    let closed = false;
    closing = repository.close().then(() => {
      closed = true;
    });
    await expect(repository.listPublishedResources()).rejects.toThrow(
      "catalog repository is closed",
    );
    await expect(repository.recordOriginProof(proof)).rejects.toThrow(
      "catalog repository is closed",
    );
    await delay(50);
    expect(closed).toBe(false);
    await observer.query("COMMIT");
    await expect(operation).resolves.toEqual({
      id: proof.proofId,
      outcome: "created",
    });
    await closing;
  } finally {
    await observer.query("ROLLBACK").catch(() => undefined);
    await operation?.catch(() => undefined);
    await closing?.catch(() => undefined);
    await repository.close();
    await observer.end();
  }
});
