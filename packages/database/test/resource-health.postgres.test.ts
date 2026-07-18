import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepositoryInput,
  ProbeObservationInput,
  ProviderOriginRegistration,
  ResourceHealthInput,
  ResourceHealthObservation,
  ResourceHealthResult,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  nonX402Probe,
  originRegistration,
  verifiedProbe,
} from "./publication.fixtures.js";

type HealthCatalog = Readonly<{
  registerProviderOrigin(input: ProviderOriginRegistration): Promise<unknown>;
  recordProbeHealth(input: {
    probe: ProbeObservationInput;
    health: ResourceHealthInput;
  }): Promise<unknown>;
  recordHealthObservation(input: ResourceHealthInput): Promise<unknown>;
  findLatestResourceHealth(
    resourceId: string,
  ): Promise<ResourceHealthObservation | null>;
  close(): Promise<void>;
}>;

type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository(input: CatalogRepositoryInput): HealthCatalog;
}>;

const HEALTHY_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96020";
const NON_X402_HEALTH_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96021";
const TRANSPORT_HEALTH_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96022";

function healthFor(
  probe: ProbeObservationInput,
  healthObservationId: string,
  result: ResourceHealthResult,
  latencyMilliseconds = 125,
): ResourceHealthInput {
  return Object.freeze({
    healthObservationId,
    originId: probe.originId,
    resourceId: probe.resourceId,
    method: probe.method,
    routeTemplate: probe.routeTemplate,
    observedAt: probe.observedAt,
    latencyMilliseconds,
    operationHash: `sha256:${"8".repeat(64)}`,
    evidenceHash: `sha256:${"f".repeat(64)}`,
    result,
  });
}

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let runtime: RuntimeModule;

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_resource_health_test");
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("atomically records verified probe health and survives restart", async () => {
  let repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await repository.registerProviderOrigin(originRegistration);
  await expect(
    repository.recordProbeHealth({
      probe: verifiedProbe,
      health: healthFor(verifiedProbe, HEALTHY_ID, { kind: "healthy" }),
    }),
  ).resolves.toEqual({ id: HEALTHY_ID, outcome: "created" });
  await repository.close();

  repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await expect(
    repository.findLatestResourceHealth(verifiedProbe.resourceId),
  ).resolves.toEqual({
    healthObservationId: HEALTHY_ID,
    probeObservationId: verifiedProbe.observationId,
    resourceId: verifiedProbe.resourceId,
    status: "healthy",
    failureDomain: null,
    failureCode: null,
    httpStatus: null,
    operationHash: `sha256:${"8".repeat(64)}`,
    observedAt: verifiedProbe.observedAt,
    latencyMilliseconds: 125,
  });
  await repository.close();
});

it("atomically records non-x402 payment-contract health", async () => {
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const probe = nonX402Probe();
  try {
    await expect(
      repository.recordProbeHealth({
        probe,
        health: healthFor(probe, NON_X402_HEALTH_ID, {
          kind: "failing",
          domain: "payment-contract",
          code: "HTTP_200",
        }),
      }),
    ).resolves.toEqual({ id: NON_X402_HEALTH_ID, outcome: "created" });
    await expect(
      repository.findLatestResourceHealth(probe.resourceId),
    ).resolves.toMatchObject({
      probeObservationId: probe.observationId,
      status: "failing",
      failureDomain: "payment-contract",
      failureCode: "HTTP_200",
    });
  } finally {
    await repository.close();
  }
});

it("records transport-only health and returns the newest durable observation", async () => {
  let repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const transport = Object.freeze({
    ...healthFor(
      verifiedProbe,
      TRANSPORT_HEALTH_ID,
      { kind: "failing", domain: "transport", code: "TIMEOUT" },
      10_000,
    ),
    observedAt: "2026-07-18T00:00:03.000Z",
  });
  await expect(repository.recordHealthObservation(transport)).resolves.toEqual({
    id: TRANSPORT_HEALTH_ID,
    outcome: "created",
  });
  await repository.close();

  repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await expect(
    repository.findLatestResourceHealth(verifiedProbe.resourceId),
  ).resolves.toEqual({
    healthObservationId: TRANSPORT_HEALTH_ID,
    probeObservationId: null,
    resourceId: verifiedProbe.resourceId,
    status: "failing",
    failureDomain: "transport",
    failureCode: "TIMEOUT",
    httpStatus: null,
    operationHash: `sha256:${"8".repeat(64)}`,
    observedAt: transport.observedAt,
    latencyMilliseconds: 10_000,
  });
  await repository.close();
});
