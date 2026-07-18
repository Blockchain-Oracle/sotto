import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepositoryInput,
  ProbeObservationInput,
} from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  originProof,
  originRegistration,
  publication,
  type PublicationCatalog,
  verifiedProbe,
} from "./publication.fixtures.js";

let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let runtime: Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<unknown>;
  createCatalogRepository(input: CatalogRepositoryInput): PublicationCatalog;
}>;

const secondProbe: ProbeObservationInput = {
  ...verifiedProbe,
  observationId: "018f3f24-7d4a-7e2c-a421-0f3473b96040",
  observedAt: "2026-07-18T00:00:02.000Z",
  evidenceHash: `sha256:${"5".repeat(64)}`,
  result: {
    ...verifiedProbe.result,
    revisionId: "018f3f24-7d4a-7e2c-a421-0f3473b96041",
    name: "Current weather v2",
    challengeHash: `sha256:${"6".repeat(64)}`,
  },
};

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_publication_rollback_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as typeof runtime;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("rolls back the listing when the final operation insert fails", async () => {
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  const fault = new Client({ connectionString: database.databaseUrl });
  await fault.connect();
  try {
    await repository.registerProviderOrigin(originRegistration);
    await repository.recordOriginProof(originProof);
    await repository.recordProbeObservation(verifiedProbe);
    await repository.publishVerifiedResource(publication);
    await repository.recordProbeObservation(secondProbe);
    await fault.query(`
      CREATE FUNCTION public.reject_test_publication() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced publication operation failure';
      END
      $$;
      CREATE TRIGGER reject_test_publication
      BEFORE INSERT ON sotto.publication_operations
      FOR EACH ROW EXECUTE FUNCTION public.reject_test_publication()
    `);
    if (secondProbe.result.kind !== "verified-x402") {
      throw new Error("invalid rollback fixture");
    }
    await expect(
      repository.publishVerifiedResource({
        ...publication,
        publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96042",
        resourceRevisionId: secondProbe.result.revisionId,
        expectedListingVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "CATALOG_PERSISTENCE" });
    await expect(repository.listPublishedResources()).resolves.toEqual([
      expect.objectContaining({
        listingVersion: 1,
        resourceRevisionId: verifiedProbe.result.revisionId,
      }),
    ]);
    const operations = await fault.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM sotto.publication_operations",
    );
    expect(operations.rows).toEqual([{ count: "1" }]);
  } finally {
    await fault.query(
      `DROP TRIGGER IF EXISTS reject_test_publication
         ON sotto.publication_operations;
       DROP FUNCTION IF EXISTS public.reject_test_publication()`,
    );
    await repository.close();
    await fault.end();
  }
});
