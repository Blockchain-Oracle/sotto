import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepository,
  CatalogRepositoryInput,
  ProbeObservationInput,
  ResourceHealthInput,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  nonX402Probe,
  originRegistration,
  verifiedProbe,
} from "./publication.fixtures.js";

type Persisted = Readonly<{
  probe: ProbeObservationInput | null;
  health: ResourceHealthInput;
}>;

type RecoveryCatalog = CatalogRepository &
  Readonly<{
    findProbeHealthById(id: string): Promise<Persisted | null>;
  }>;

type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository(input: CatalogRepositoryInput): RecoveryCatalog;
}>;

const HEALTHY_ID = "018f3f24-7d4a-7e2c-a421-0f3473b97040";
const NON_X402_ID = "018f3f24-7d4a-7e2c-a421-0f3473b97041";
const TRANSPORT_ID = "018f3f24-7d4a-7e2c-a421-0f3473b97042";
const PROVIDER_ID = "018f3f24-7d4a-7e2c-a421-0f3473b97043";

function healthFor(
  probe: ProbeObservationInput,
  healthObservationId: string,
  result: ResourceHealthInput["result"],
  observedAt = probe.observedAt,
): ResourceHealthInput {
  return Object.freeze({
    healthObservationId,
    originId: probe.originId,
    resourceId: probe.resourceId,
    method: probe.method,
    routeTemplate: probe.routeTemplate,
    observedAt,
    latencyMilliseconds: 125,
    operationHash: `sha256:${"8".repeat(64)}`,
    evidenceHash: `sha256:${"9".repeat(64)}`,
    result: Object.freeze(result),
  });
}

function unlinked(
  healthObservationId: string,
  routeTemplate: string,
  result: ResourceHealthInput["result"],
): ResourceHealthInput {
  return healthFor(
    {
      ...verifiedProbe,
      resourceId: healthObservationId,
      routeTemplate,
    },
    healthObservationId,
    result,
    "2026-07-18T00:00:04.000Z",
  );
}

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let runtime: RuntimeModule;

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_resource_health_recovery_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("recovers exact linked and unlinked health after restart", async () => {
  const nonX402 = nonX402Probe();
  const healthy = healthFor(verifiedProbe, HEALTHY_ID, { kind: "healthy" });
  const payment = healthFor(nonX402, NON_X402_ID, {
    kind: "failing",
    domain: "payment-contract",
    code: "HTTP_200",
  });
  const transport = unlinked(TRANSPORT_ID, "/timeout", {
    kind: "failing",
    domain: "transport",
    code: "TIMEOUT",
  });
  const provider = unlinked(PROVIDER_ID, "/unavailable", {
    kind: "failing",
    domain: "provider-handler",
    code: "HTTP_STATUS",
    httpStatus: 503,
  });
  let repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await repository.registerProviderOrigin(originRegistration);
  await repository.recordProbeHealth({ probe: verifiedProbe, health: healthy });
  await repository.recordProbeHealth({ probe: nonX402, health: payment });
  await repository.recordHealthObservation(transport);
  await repository.recordHealthObservation(provider);
  await repository.close();

  repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await expect(repository.findProbeHealthById(HEALTHY_ID)).resolves.toEqual({
    probe: verifiedProbe,
    health: healthy,
  });
  await expect(repository.findProbeHealthById(NON_X402_ID)).resolves.toEqual({
    probe: nonX402,
    health: payment,
  });
  await expect(repository.findProbeHealthById(TRANSPORT_ID)).resolves.toEqual({
    probe: null,
    health: transport,
  });
  await expect(repository.findProbeHealthById(PROVIDER_ID)).resolves.toEqual({
    probe: null,
    health: provider,
  });
  await expect(
    repository.findProbeHealthById("018f3f24-7d4a-7e2c-a421-0f3473b97044"),
  ).resolves.toBeNull();
  await expect(
    repository.recordProbeHealth({ probe: verifiedProbe, health: healthy }),
  ).resolves.toEqual({ id: HEALTHY_ID, outcome: "replayed" });
  await expect(
    repository.recordProbeHealth({
      probe: verifiedProbe,
      health: {
        ...healthy,
        operationHash: `sha256:${"7".repeat(64)}`,
      },
    }),
  ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });
  await repository.close();
});

it("rejects corrupted durable probe identity with a redacted error", async () => {
  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  await client.query(
    `UPDATE sotto.probe_observations SET request_hash = $1
     WHERE observation_id = $2`,
    ["0".repeat(64), verifiedProbe.observationId],
  );
  await client.end();
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  try {
    await expect(
      repository.findProbeHealthById(HEALTHY_ID),
    ).rejects.toMatchObject({
      code: "CATALOG_PERSISTENCE",
      message: "catalog persistence failed",
    });
  } finally {
    await repository.close();
  }
});
