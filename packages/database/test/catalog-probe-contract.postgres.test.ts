import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogProbe,
  CatalogProbeDependencies,
  CatalogProbeInput,
} from "../../catalog-probe/src/index.js";
import type { CatalogRepository } from "../src/index.js";
import {
  invalidPaymentResponse,
  INVALID_ROUTE,
} from "./catalog-probe-contract.postgres.fixture.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import { originRegistration } from "./publication.fixtures.js";

const INVALID_OBSERVATION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96201";
const INVALID_RESOURCE_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96202";
const INVALID_REVISION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96203";
const FAILURE_ROUTE = "/weather/unavailable";
const FAILURE_OBSERVATION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96204";
const FAILURE_RESOURCE_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96205";
const FAILURE_REVISION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96206";

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let createCatalogRepository: (input: {
  databaseUrl: string;
}) => CatalogRepository;
let createCatalogProbe: (input: CatalogProbeDependencies) => CatalogProbe;

function probeInput(
  observationId: string,
  resourceId: string,
  revisionId: string,
  routeTemplate: string,
): CatalogProbeInput {
  return {
    observationId,
    originId: originRegistration.originId,
    resourceId,
    revisionId,
    method: "GET",
    routeTemplate,
    name: "Current weather",
    description: "Return current weather for one location.",
  };
}

function probe(
  catalog: CatalogRepository,
  response: () => Response,
): CatalogProbe {
  return createCatalogProbe({
    expectedNetwork: "canton:devnet",
    store: catalog,
    resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
    requestPinnedHttps: async () => response(),
  });
}

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_catalog_probe_contract_test",
  );
  const migrationUrl = new URL("../dist/migrate.js", import.meta.url).href;
  const catalogUrl = new URL("../dist/catalog.js", import.meta.url).href;
  const probeUrl = new URL("../../catalog-probe/dist/index.js", import.meta.url)
    .href;
  const migration = (await import(/* @vite-ignore */ migrationUrl)) as {
    applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
  };
  ({ createCatalogRepository } = (await import(
    /* @vite-ignore */ catalogUrl
  )) as { createCatalogRepository: typeof createCatalogRepository });
  ({ createCatalogProbe } = (await import(/* @vite-ignore */ probeUrl)) as {
    createCatalogProbe: typeof createCatalogProbe;
  });
  await migration.applyDatabaseMigrations({
    databaseUrl: database.databaseUrl,
  });
});

afterAll(async () => database?.drop());

it("persists a DB-safe failure for an unsupported payment identifier", async () => {
  let catalog = createCatalogRepository({ databaseUrl: database.databaseUrl });
  try {
    await catalog.registerProviderOrigin(originRegistration);
    const input = probeInput(
      INVALID_OBSERVATION_ID,
      INVALID_RESOURCE_ID,
      INVALID_REVISION_ID,
      INVALID_ROUTE,
    );
    const result = await probe(
      catalog,
      invalidPaymentResponse,
    ).acquireAndRecord(input);

    expect(result).toMatchObject({
      outcome: "observed",
      observation: {
        result: { kind: "non-x402", reason: "UNSUPPORTED_REQUIREMENT" },
      },
      health: {
        result: {
          kind: "failing",
          domain: "payment-contract",
          code: "UNSUPPORTED_REQUIREMENT",
        },
      },
    });
    await catalog.close();
    catalog = createCatalogRepository({ databaseUrl: database.databaseUrl });
    await expect(
      catalog.findProbeHealthById(input.observationId),
    ).resolves.toMatchObject({
      probe: {
        result: { kind: "non-x402", reason: "UNSUPPORTED_REQUIREMENT" },
      },
      health: {
        result: {
          kind: "failing",
          domain: "payment-contract",
          code: "UNSUPPORTED_REQUIREMENT",
        },
      },
    });
  } finally {
    await catalog.close();
  }
});

it("recovers the provider's exact failing HTTP status", async () => {
  let catalog = createCatalogRepository({ databaseUrl: database.databaseUrl });
  try {
    await catalog.registerProviderOrigin(originRegistration);
    const input = probeInput(
      FAILURE_OBSERVATION_ID,
      FAILURE_RESOURCE_ID,
      FAILURE_REVISION_ID,
      FAILURE_ROUTE,
    );
    const result = await probe(
      catalog,
      () => new Response(null, { status: 503 }),
    ).acquireAndRecord(input);
    expect(result).toMatchObject({
      outcome: "failed",
      health: {
        result: {
          kind: "failing",
          domain: "provider-handler",
          code: "HTTP_STATUS",
          httpStatus: 503,
        },
      },
    });
    await catalog.close();
    catalog = createCatalogRepository({ databaseUrl: database.databaseUrl });
    await expect(
      catalog.findProbeHealthById(input.observationId),
    ).resolves.toMatchObject({
      probe: null,
      health: {
        result: {
          kind: "failing",
          domain: "provider-handler",
          code: "HTTP_STATUS",
          httpStatus: 503,
        },
      },
    });
  } finally {
    await catalog.close();
  }
});
