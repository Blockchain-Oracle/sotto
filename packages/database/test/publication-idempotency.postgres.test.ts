import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type {
  CatalogRepositoryInput,
  ProbeObservationInput,
  PublishVerifiedResourceInput,
} from "../src/index.js";
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

function probeRevision(sequence: 2 | 3): ProbeObservationInput {
  const challengeMarker = { 2: "8", 3: "9" }[sequence];
  return Object.freeze({
    ...verifiedProbe,
    observationId: `018f3f24-7d4a-7e2c-a421-0f3473b9601${sequence * 2}`,
    observedAt: `2026-07-18T00:00:0${sequence}.000Z`,
    evidenceHash:
      sequence === 2
        ? verifiedProbe.evidenceHash
        : `sha256:${String(sequence + 3).repeat(64)}`,
    result: Object.freeze({
      ...verifiedProbe.result,
      revisionId: `018f3f24-7d4a-7e2c-a421-0f3473b9601${sequence * 2 + 1}`,
      name: `Current weather v${sequence}`,
      challengeHash:
        sequence === 2
          ? verifiedProbe.result.challengeHash
          : `sha256:${challengeMarker.repeat(64)}`,
    }),
  });
}

function publishRevision(
  publicationId: string,
  revisionId: string,
  expectedListingVersion: number,
): PublishVerifiedResourceInput {
  return Object.freeze({
    ...publication,
    publicationId,
    resourceRevisionId: revisionId,
    expectedListingVersion,
  });
}

beforeAll(async () => {
  database = await createPostgresTestDatabase(
    "sotto_publication_idempotency_test",
  );
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  runtime = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
});

afterAll(async () => database?.drop());

it("replays exactly and serializes stale concurrent publications", async () => {
  let repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await repository.registerProviderOrigin(originRegistration);
  await expect(repository.recordOriginProof(originProof)).resolves.toEqual({
    id: originProof.proofId,
    outcome: "created",
  });
  await expect(repository.recordOriginProof(originProof)).resolves.toEqual({
    id: originProof.proofId,
    outcome: "replayed",
  });
  await expect(
    repository.recordOriginProof({
      ...originProof,
      evidenceHash: `sha256:${"f".repeat(64)}`,
    }),
  ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });
  await expect(
    repository.recordProbeObservation(verifiedProbe),
  ).resolves.toEqual({ id: verifiedProbe.observationId, outcome: "created" });
  await expect(
    repository.recordProbeObservation(verifiedProbe),
  ).resolves.toEqual({ id: verifiedProbe.observationId, outcome: "replayed" });
  await expect(
    repository.recordProbeObservation({
      ...verifiedProbe,
      evidenceHash: `sha256:${"9".repeat(64)}`,
    }),
  ).rejects.toMatchObject({ code: "CATALOG_CONFLICT" });

  const created = await repository.publishVerifiedResource(publication);
  expect(created).toMatchObject({
    outcome: "created",
    listingVersion: 1,
    resourceRevisionId: verifiedProbe.result.revisionId,
  });
  await expect(
    repository.publishVerifiedResource(publication),
  ).resolves.toEqual({ ...created, outcome: "replayed" });
  await repository.close();

  repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await expect(
    repository.publishVerifiedResource(publication),
  ).resolves.toEqual({ ...created, outcome: "replayed" });
  const second = probeRevision(2);
  await repository.recordProbeObservation(second);
  if (second.result.kind !== "verified-x402") {
    throw new Error("invalid second revision fixture");
  }
  await expect(
    repository.publishVerifiedResource(publication),
  ).resolves.toEqual({ ...created, outcome: "replayed" });
  await expect(
    repository.publishVerifiedResource(
      publishRevision(
        "018f3f24-7d4a-7e2c-a421-0f3473b96020",
        verifiedProbe.result.revisionId,
        1,
      ),
    ),
  ).rejects.toMatchObject({ code: "PUBLICATION_STALE" });
  await expect(
    repository.publishVerifiedResource(
      publishRevision(
        "018f3f24-7d4a-7e2c-a421-0f3473b96021",
        second.result.revisionId,
        1,
      ),
    ),
  ).resolves.toMatchObject({ outcome: "created", listingVersion: 2 });

  const third = probeRevision(3);
  await repository.recordProbeObservation(third);
  if (third.result.kind !== "verified-x402") throw new Error("invalid fixture");
  const thirdRevisionId = third.result.revisionId;
  const competitors = ["22", "23"].map((suffix) =>
    repository.publishVerifiedResource(
      publishRevision(
        `018f3f24-7d4a-7e2c-a421-0f3473b960${suffix}`,
        thirdRevisionId,
        2,
      ),
    ),
  );
  const settled = await Promise.allSettled(competitors);
  expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const rejected = settled.filter(({ status }) => status === "rejected");
  expect(rejected).toHaveLength(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
    code: "PUBLICATION_STALE",
  });
  await expect(repository.listPublishedResources()).resolves.toEqual([
    expect.objectContaining({
      listingVersion: 3,
      name: "Current weather v3",
      resourceRevisionId: thirdRevisionId,
    }),
  ]);

  await repository.close();

  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    const counts = await client.query<{
      operations: string;
      revisions: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM sotto.publication_operations) AS operations,
         (SELECT count(*)::text FROM sotto.resource_revisions) AS revisions`,
    );
    expect(counts.rows).toEqual([{ operations: "3", revisions: "3" }]);
  } finally {
    await client.end();
  }
});
