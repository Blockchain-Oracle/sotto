import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { CatalogRepository, ProbeObservationInput } from "../src/index.js";
import type {
  CatalogProbe,
  CatalogProbeDependencies,
  CatalogProbeInput,
  CatalogPinnedHttpsRequester,
} from "../../catalog-probe/src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  originProof,
  originRegistration,
  publication,
} from "./publication.fixtures.js";
const CURRENT_ROUTE = "/weather/current";
const CURRENT_URL = `https://weather.example.com${CURRENT_ROUTE}`;
const FREE_ROUTE = "/free";
const FREE_RESOURCE_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96111";
const FREE_REVISION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96112";
const FREE_OBSERVATION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96113";
let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let provider: Server;
let providerPort: number;

function challengeHeader(): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      resource: { url: CURRENT_URL },
      accepts: [
        {
          scheme: "exact",
          network: "canton:devnet",
          amount: "2500000000",
          asset: "CC",
          payTo: "sotto-weather-provider::1220provider",
          maxTimeoutSeconds: 60,
          extra: {
            assetTransferMethod: "transfer-factory",
            executeBeforeSeconds: 45,
            feePayer: "sotto-payer::1220payer",
            instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
            synchronizerId: "global-domain::1220sync",
          },
        },
      ],
    }),
  ).toString("base64");
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("test provider address is invalid"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
}

beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_catalog_probe_test");
  const migrationUrl = new URL("../dist/migrate.js", import.meta.url).href;
  const migration = (await import(/* @vite-ignore */ migrationUrl)) as {
    applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
  };
  await migration.applyDatabaseMigrations({
    databaseUrl: database.databaseUrl,
  });
  provider = createServer((request, response) => {
    if (
      request.headers.authorization !== undefined ||
      request.headers.cookie !== undefined ||
      request.headers["payment-signature"] !== undefined
    ) {
      response.writeHead(500).end();
      return;
    }
    if (request.url === CURRENT_ROUTE) {
      response.writeHead(402, { "PAYMENT-REQUIRED": challengeHeader() }).end();
      return;
    }
    response.writeHead(request.url === FREE_ROUTE ? 200 : 404).end();
  });
  providerPort = await listen(provider);
});

afterAll(async () => {
  if (provider?.listening) await closeServer(provider);
  await database?.drop();
});

function probeInput(): CatalogProbeInput {
  return {
    observationId: "018f3f24-7d4a-7e2c-a421-0f3473b96007",
    originId: originRegistration.originId,
    resourceId: "018f3f24-7d4a-7e2c-a421-0f3473b96005",
    revisionId: "018f3f24-7d4a-7e2c-a421-0f3473b96006",
    method: "GET",
    routeTemplate: CURRENT_ROUTE,
    name: "Current weather",
    description: "Return current weather for one location.",
  };
}

it("persists a server-observed x402 audit across restart", async () => {
  const catalogUrl = new URL("../dist/catalog.js", import.meta.url).href;
  const probeUrl = new URL("../../catalog-probe/dist/index.js", import.meta.url)
    .href;
  const { createCatalogRepository } = (await import(
    /* @vite-ignore */ catalogUrl
  )) as {
    createCatalogRepository(input: { databaseUrl: string }): CatalogRepository;
  };
  const { createCatalogProbe } = (await import(
    /* @vite-ignore */ probeUrl
  )) as { createCatalogProbe(input: CatalogProbeDependencies): CatalogProbe };
  let catalog = createCatalogRepository({ databaseUrl: database.databaseUrl });
  const requestPinnedHttps: CatalogPinnedHttpsRequester = async (
    target,
    request,
  ) => {
    const url = new URL(target.url);
    return await fetch(`http://127.0.0.1:${providerPort}${url.pathname}`, {
      ...(request.body === undefined
        ? {}
        : { body: Buffer.from(request.body) }),
      method: request.method,
      redirect: "error",
      signal: request.signal,
    });
  };
  try {
    await catalog.registerProviderOrigin(originRegistration);
    const probe = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      store: catalog,
      resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      requestPinnedHttps,
    });
    const verified = await probe.acquireAndRecord(probeInput());
    if (verified.outcome !== "observed") throw new Error("probe failed");
    expect(verified.observation.result).toMatchObject({
      kind: "verified-x402",
      amountAtomic: "2500000000",
    });
    await catalog.recordOriginProof(originProof);
    await catalog.publishVerifiedResource(publication);
    await catalog.close();

    catalog = createCatalogRepository({ databaseUrl: database.databaseUrl });
    await expect(catalog.listPublishedResources()).resolves.toMatchObject([
      {
        resourceId: probeInput().resourceId,
        lastVerifiedAt: expect.any(String),
      },
    ]);
    const probeAfterRestart = createCatalogProbe({
      expectedNetwork: "canton:devnet",
      store: catalog,
      resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
      requestPinnedHttps,
    });
    const free: CatalogProbeInput = {
      ...probeInput(),
      observationId: FREE_OBSERVATION_ID,
      resourceId: FREE_RESOURCE_ID,
      revisionId: FREE_REVISION_ID,
      routeTemplate: FREE_ROUTE,
    };
    const rejected = await probeAfterRestart.acquireAndRecord(free);
    if (rejected.outcome !== "observed") throw new Error("probe failed");
    expect(rejected.observation as ProbeObservationInput).toMatchObject({
      result: { kind: "non-x402", reason: "HTTP_200" },
    });
    await expect(
      catalog.publishVerifiedResource({
        ...publication,
        publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96114",
        listingId: "018f3f24-7d4a-7e2c-a421-0f3473b96115",
        resourceId: FREE_RESOURCE_ID,
        resourceRevisionId: FREE_REVISION_ID,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_INELIGIBLE" });
  } finally {
    await catalog.close();
  }
});
