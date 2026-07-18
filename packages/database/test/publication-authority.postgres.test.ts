import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { CatalogRepositoryInput } from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  originProof,
  originRegistration,
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

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_publication_authority_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("rejects another owner and an expired latest origin proof", async () => {
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const attacker = {
    ...originRegistration,
    registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b96030",
    ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b96031",
    ownerPartyId: "sotto-other-owner::1220owner",
    providerId: "018f3f24-7d4a-7e2c-a421-0f3473b96032",
    providerDisplayName: "Other provider",
    originId: "018f3f24-7d4a-7e2c-a421-0f3473b96033",
    originUrl: "https://other.example.com/",
  };
  const expiredProof = {
    ...originProof,
    proofId: "018f3f24-7d4a-7e2c-a421-0f3473b96034",
    proofRevision: 2,
    challengeHash: `sha256:${"3".repeat(64)}` as const,
    evidenceHash: `sha256:${"4".repeat(64)}` as const,
    verifiedAt: "2020-07-18T00:00:00.000Z",
    expiresAt: "2021-07-18T00:00:00.000Z",
  };
  try {
    await repository.registerProviderOrigin(originRegistration);
    await repository.registerProviderOrigin(attacker);
    await repository.recordOriginProof(originProof);
    await repository.recordProbeObservation(verifiedProbe);
    await repository.publishVerifiedResource(publication);

    await expect(
      repository.recordOriginProof({
        ...originProof,
        proofId: "018f3f24-7d4a-7e2c-a421-0f3473b96035",
        ownerId: attacker.ownerId,
        proofRevision: 2,
        challengeHash: `sha256:${"5".repeat(64)}`,
        evidenceHash: `sha256:${"6".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_INELIGIBLE" });
    await expect(
      repository.publishVerifiedResource({
        ...publication,
        publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96036",
        ownerId: attacker.ownerId,
        expectedListingVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_INELIGIBLE" });

    await repository.recordOriginProof(expiredProof);
    await expect(
      repository.publishVerifiedResource({
        ...publication,
        publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96037",
        originProofId: expiredProof.proofId,
        expectedListingVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_INELIGIBLE" });
    await expect(repository.listPublishedResources()).resolves.toEqual([
      expect.objectContaining({ listingVersion: 1 }),
    ]);
  } finally {
    await repository.close();
  }

  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    const counts = await client.query<{
      listings: string;
      operations: string;
      proofs: string;
    }>(`SELECT
      (SELECT count(*)::text FROM sotto.origin_proofs) AS proofs,
      (SELECT count(*)::text FROM sotto.listings) AS listings,
      (SELECT count(*)::text FROM sotto.publication_operations) AS operations`);
    expect(counts.rows).toEqual([
      { listings: "1", operations: "1", proofs: "2" },
    ]);
  } finally {
    await client.end();
  }
});
