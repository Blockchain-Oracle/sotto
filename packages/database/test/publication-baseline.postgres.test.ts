import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { CatalogRepositoryInput } from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  nonX402Probe,
  originProof,
  originRegistration,
  OWNER_ID,
  publication,
  type PublicationCatalog,
  verifiedProbe,
} from "./publication.fixtures.js";

type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository(input: CatalogRepositoryInput): PublicationCatalog;
}>;

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let runtime: RuntimeModule;

const publicResource = Object.freeze({
  resourceId: publication.resourceId,
  resourceRevisionId: publication.resourceRevisionId,
  listingVersion: 1,
  providerId: originRegistration.providerId,
  providerDisplayName: originRegistration.providerDisplayName,
  normalizedOrigin: "https://weather.example.com",
  name: verifiedProbe.result.name,
  description: verifiedProbe.result.description,
  method: verifiedProbe.method,
  routeTemplate: verifiedProbe.routeTemplate,
  x402Version: verifiedProbe.result.x402Version,
  scheme: verifiedProbe.result.scheme,
  network: verifiedProbe.result.network,
  asset: verifiedProbe.result.asset,
  recipient: verifiedProbe.result.recipient,
  amountAtomic: verifiedProbe.result.amountAtomic,
  transferMethod: verifiedProbe.result.transferMethod,
  lastVerifiedAt: verifiedProbe.observedAt,
});

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_publication_baseline_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("publishes one verified immutable revision and survives restart", async () => {
  let repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await expect(repository.listPublishedResources()).resolves.toEqual([]);
  await repository.registerProviderOrigin(originRegistration);
  await repository.recordOriginProof(originProof);
  await repository.recordProbeObservation(verifiedProbe);
  await expect(
    repository.publishVerifiedResource(publication),
  ).resolves.toEqual({ ...publicResource, outcome: "created" });
  await repository.close();

  repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const persisted = await repository.listPublishedResources();
  expect(persisted).toEqual([publicResource]);
  const rendered = JSON.stringify(persisted);
  for (const privateValue of [
    OWNER_ID,
    originRegistration.ownerPartyId,
    originProof.proofId,
    originProof.challengeHash,
    originProof.evidenceHash,
    verifiedProbe.evidenceHash,
    verifiedProbe.result.challengeHash,
  ]) {
    expect(rendered).not.toContain(privateValue);
  }
  await repository.close();
});

it("persists non-x402 evidence without making it publishable", async () => {
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const observation = nonX402Probe();
  try {
    await repository.recordProbeObservation(observation);
    await expect(
      repository.publishVerifiedResource({
        ...publication,
        publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96012",
        listingId: "018f3f24-7d4a-7e2c-a421-0f3473b96013",
        resourceId: observation.resourceId,
        resourceRevisionId: "018f3f24-7d4a-7e2c-a421-0f3473b96014",
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_INELIGIBLE" });
    await expect(repository.listPublishedResources()).resolves.toEqual([
      publicResource,
    ]);
  } finally {
    await repository.close();
  }

  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ outcome: string }>(
      `SELECT outcome FROM sotto.probe_observations
       WHERE observation_id = $1`,
      [observation.observationId],
    );
    expect(result.rows).toEqual([{ outcome: "non-x402" }]);
  } finally {
    await client.end();
  }
});
