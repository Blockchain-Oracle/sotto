import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepository,
  CatalogRepositoryInput,
  ProbeObservationInput,
  ResourceHealthInput,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import { originRegistration, verifiedProbe } from "./publication.fixtures.js";

type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository(input: CatalogRepositoryInput): CatalogRepository;
}>;

const HEALTH_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96030";
const CONFLICT_HEALTH_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96034";

function healthFor(
  probe: ProbeObservationInput,
  healthObservationId = HEALTH_ID,
): ResourceHealthInput {
  return Object.freeze({
    healthObservationId,
    originId: probe.originId,
    resourceId: probe.resourceId,
    method: probe.method,
    routeTemplate: probe.routeTemplate,
    observedAt: probe.observedAt,
    latencyMilliseconds: 125,
    operationHash: `sha256:${"8".repeat(64)}`,
    evidenceHash: `sha256:${"f".repeat(64)}`,
    result: Object.freeze({ kind: "healthy" }),
  });
}

function rollbackProbe(): ProbeObservationInput {
  return Object.freeze({
    ...verifiedProbe,
    observationId: "018f3f24-7d4a-7e2c-a421-0f3473b96031",
    resourceId: "018f3f24-7d4a-7e2c-a421-0f3473b96032",
    routeTemplate: "/weather/rollback",
    result: Object.freeze({
      ...verifiedProbe.result,
      revisionId: "018f3f24-7d4a-7e2c-a421-0f3473b96033",
    }),
  });
}

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let runtime: RuntimeModule;

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_resource_health_atomicity_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("authenticates the persisted probe before replaying linked health", async () => {
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  try {
    await repository.registerProviderOrigin(originRegistration);
    const input = { probe: verifiedProbe, health: healthFor(verifiedProbe) };
    await expect(repository.recordProbeHealth(input)).resolves.toEqual({
      id: HEALTH_ID,
      outcome: "created",
    });
    await expect(repository.recordProbeHealth(input)).resolves.toEqual({
      id: HEALTH_ID,
      outcome: "replayed",
    });

    const changedProbe = Object.freeze({
      ...verifiedProbe,
      evidenceHash: `sha256:${"1".repeat(64)}` as const,
    });
    await expect(
      repository.recordProbeHealth({
        probe: changedProbe,
        health: healthFor(changedProbe),
      }),
    ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });
  } finally {
    await repository.close();
  }
});

it("rolls back a newly inserted probe and revision when health conflicts", async () => {
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const probe = rollbackProbe();
  try {
    await repository.registerProviderOrigin(originRegistration);
    await repository.recordProbeHealth({
      probe: verifiedProbe,
      health: healthFor(verifiedProbe, CONFLICT_HEALTH_ID),
    });
    await expect(
      repository.recordProbeHealth({
        probe,
        health: healthFor(probe, CONFLICT_HEALTH_ID),
      }),
    ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });
  } finally {
    await repository.close();
  }

  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ probes: string; revisions: string }>(
      `SELECT
         (SELECT count(*)::text FROM sotto.probe_observations
          WHERE observation_id = $1) AS probes,
         (SELECT count(*)::text FROM sotto.resource_revisions
          WHERE observation_id = $1) AS revisions`,
      [probe.observationId],
    );
    expect(result.rows).toEqual([{ probes: "0", revisions: "0" }]);
  } finally {
    await client.end();
  }
});
