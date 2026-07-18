import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type {
  CatalogOperationalEvent,
  CatalogRepository,
  CatalogRepositoryInput,
  ProviderOriginRegistration,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";

type RepositoryFactory = (input: CatalogRepositoryInput) => CatalogRepository;
type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository: RepositoryFactory;
}>;

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let createRepository: RepositoryFactory;

const registration: ProviderOriginRegistration = {
  registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b95000",
  ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b95001",
  ownerPartyId: "sotto-lifecycle::1220owner",
  providerId: "018f3f24-7d4a-7e2c-a421-0f3473b95002",
  providerDisplayName: "Lifecycle provider",
  originId: "018f3f24-7d4a-7e2c-a421-0f3473b95003",
  originUrl: "https://lifecycle.example.com/",
};

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_catalog_lifecycle_test");
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
  createRepository = runtime.createCatalogRepository;
});

afterAll(async () => database?.drop());

async function waitForBackend(
  client: Client,
  applicationName: string,
  waitEventType?: string,
): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity
       WHERE application_name = $1 AND pid <> pg_backend_pid()
         AND ($2::text IS NULL OR wait_event_type = $2)`,
      [applicationName, waitEventType ?? null],
    );
    if (result.rows[0] !== undefined) return result.rows[0].pid;
    await delay(10);
  }
  throw new Error("catalog backend was not observed");
}

it("drains admitted work before closing a one-connection pool", async () => {
  const applicationName = "sotto-catalog-drain-test";
  const repository = createRepository({
    databaseUrl: database.databaseUrl,
    maxConnections: 1,
    applicationName,
  });
  const observer = new Client({ connectionString: database.databaseUrl });
  await observer.connect();
  let operation: Promise<unknown> | undefined;
  let queued: Promise<unknown> | undefined;
  let closing: Promise<void> | undefined;
  try {
    await repository.findProviderOrigin("https://prime.example.com/");
    await waitForBackend(observer, applicationName);
    await observer.query("BEGIN");
    await observer.query("LOCK TABLE sotto.owners IN ACCESS EXCLUSIVE MODE");
    operation = repository.registerProviderOrigin(registration);
    void operation.catch(() => undefined);
    await waitForBackend(observer, applicationName, "Lock");
    queued = repository.findProviderOrigin("https://absent.example.com/");
    void queued.catch(() => undefined);
    let closed = false;
    closing = repository.close().then(() => {
      closed = true;
    });
    await expect(
      repository.findProviderOrigin("https://new-work.example.com/"),
    ).rejects.toThrow("catalog repository is closed");
    await expect(
      repository.registerProviderOrigin(registration),
    ).rejects.toThrow("catalog repository is closed");
    await delay(50);
    expect(closed).toBe(false);
    await observer.query("COMMIT");
    await expect(operation).resolves.toMatchObject({ outcome: "created" });
    await expect(queued).resolves.toBeNull();
    await closing;
    await expect(
      repository.findProviderOrigin(registration.originUrl),
    ).rejects.toThrow("catalog repository is closed");
    await repository.close();
  } finally {
    await observer.query("ROLLBACK").catch(() => undefined);
    await operation?.catch(() => undefined);
    await queued?.catch(() => undefined);
    await closing?.catch(() => undefined);
    await repository.close();
    await observer.end();
  }
});

it("handles an idle backend termination without exposing the pg error", async () => {
  const applicationName = "sotto-catalog-error-test";
  let unhandledRejection: unknown;
  const captureUnhandled = (reason: unknown) => {
    unhandledRejection = reason;
  };
  process.on("unhandledRejection", captureUnhandled);
  const callbackFailure = Promise.reject(new Error("private callback failure"));
  const callbackCatch = vi.spyOn(callbackFailure, "catch");
  void callbackFailure.catch(() => undefined);
  callbackCatch.mockClear();
  const operationalError = vi.fn(
    (event: CatalogOperationalEvent): Promise<void> => {
      void event;
      return callbackFailure;
    },
  );
  const repository = createRepository({
    databaseUrl: database.databaseUrl,
    maxConnections: 1,
    applicationName,
    onOperationalError: operationalError,
  });
  const observer = new Client({ connectionString: database.databaseUrl });
  await observer.connect();
  try {
    await repository.findProviderOrigin("https://absent.example.com/");
    const pid = await waitForBackend(observer, applicationName);
    const termination = await observer.query<{ terminated: boolean }>(
      "SELECT pg_terminate_backend($1) AS terminated",
      [pid],
    );
    expect(termination.rows).toEqual([{ terminated: true }]);
    await vi.waitFor(() => expect(operationalError).toHaveBeenCalledTimes(1));
    expect(operationalError.mock.calls).toEqual([
      [{ code: "CATALOG_POOL_ERROR" }],
    ]);
    expect(callbackCatch).toHaveBeenCalledTimes(1);
    await expect(
      repository.findProviderOrigin("https://still-absent.example.com/"),
    ).resolves.toBeNull();
    await delay(0);
    expect(unhandledRejection).toBeUndefined();
  } finally {
    process.off("unhandledRejection", captureUnhandled);
    await repository.close();
    await observer.end();
  }
});

it("redacts an initial PostgreSQL connection failure", async () => {
  const disposable = await createPostgresTestDatabase(
    "sotto_catalog_connect_failure_test",
  );
  const secret = new URL(disposable.databaseUrl).password;
  const repository = createRepository({ databaseUrl: disposable.databaseUrl });
  await disposable.drop();
  let error: unknown;
  try {
    await repository.registerProviderOrigin(registration);
  } catch (caught) {
    error = caught;
  } finally {
    await repository.close();
  }
  expect(error).toMatchObject({
    code: "CATALOG_PERSISTENCE",
    message: "catalog persistence failed",
  });
  expect(
    [String(error), error instanceof Error ? error.stack : ""].join("\n"),
  ).not.toContain(secret);
});
