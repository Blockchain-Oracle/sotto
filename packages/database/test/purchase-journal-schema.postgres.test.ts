import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { CatalogRepositoryInput } from "../src/index.js";
import { createPostgresTestDatabase } from "./postgres-test-database.js";
import {
  originRegistration,
  type PublicationCatalog,
  verifiedProbe,
} from "./publication.fixtures.js";
import { PURCHASE_JOURNAL_COLUMNS } from "./purchase-journal-schema.fixture.js";
import {
  insertSchemaAuthority,
  insertSchemaEvent,
  insertSchemaJob,
} from "./purchase-journal-schema-inserts.fixture.js";
type RuntimeModule = Readonly<{
  applyDatabaseMigrations(input: { databaseUrl: string }): Promise<void>;
  createCatalogRepository(input: CatalogRepositoryInput): PublicationCatalog;
}>;
type Attempt = ReturnType<typeof attempt>;
let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
let client: Client;
function sha(marker: string): string {
  return `sha256:${marker.repeat(64)}`;
}
function attempt(marker: string) {
  return {
    attemptId: sha(marker),
    operationId: sha(marker === "a" ? "1" : marker),
    requestHash: marker.repeat(64),
    requestCommitment: sha("c"),
    challengeId: sha(marker === "a" ? "2" : marker),
    purchaseCommitment: sha(marker === "a" ? "3" : marker),
    authorizationMode: "human-wallet",
    commitmentVersion: "sotto-human-purchase-v1",
    beginExclusive: "0",
    executeBefore: "2099-07-18T00:01:00.000Z",
    sourceCommit: marker.repeat(40),
    state: "intent-created",
  };
}
async function insertAttempt(value: Attempt): Promise<string> {
  const result = await client.query<{ commandId: string }>(
    `INSERT INTO sotto.purchase_attempts
      (attempt_id, operation_id, request_hash, owner_id, resource_revision_id,
       authorization_mode, commitment_version, request_commitment, challenge_id,
       purchase_commitment, begin_exclusive, execute_before, source_commit, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING command_id AS "commandId"`,
    [
      value.attemptId,
      value.operationId,
      value.requestHash,
      originRegistration.ownerId,
      verifiedProbe.result.revisionId,
      value.authorizationMode,
      value.commitmentVersion,
      value.requestCommitment,
      value.challengeId,
      value.purchaseCommitment,
      value.beginExclusive,
      value.executeBefore,
      value.sourceCommit,
      value.state,
    ],
  );
  return result.rows[0]!.commandId;
}
beforeAll(async () => {
  database = await createPostgresTestDatabase("sotto_purchase_journal_test");
  const runtime = (await import(
    /* @vite-ignore */ new URL("../dist/index.js", import.meta.url).href
  )) as RuntimeModule;
  await runtime.applyDatabaseMigrations({ databaseUrl: database.databaseUrl });
  const repository = runtime.createCatalogRepository({
    databaseUrl: database.databaseUrl,
  });
  await repository.registerProviderOrigin(originRegistration);
  await repository.recordProbeObservation(verifiedProbe);
  await repository.close();
  client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
});
afterAll(async () => {
  await client?.end();
  await database?.drop();
});
it("creates the exact privacy-safe purchase aggregate", async () => {
  const value = attempt("a");
  const commandId = await insertAttempt(value);
  await insertSchemaEvent(client, value);
  await insertSchemaAuthority(client, value);
  await insertSchemaJob(client, value, "018f3f24-7d4a-7e2c-a421-0f3473b98001");
  expect(commandId).toBe(`sotto-human-purchase-v1-${"3".repeat(64)}`);
  const columns = await client.query<{
    columnName: string;
    tableName: string;
  }>(
    `SELECT table_name AS "tableName", column_name AS "columnName"
     FROM information_schema.columns
     WHERE table_schema = 'sotto'
       AND table_name IN ('purchase_attempts', 'attempt_events', 'outbox_jobs')
     ORDER BY table_name, column_name`,
  );
  expect(
    columns.rows.map(
      ({ tableName, columnName }) => `${tableName}.${columnName}`,
    ),
  ).toEqual(PURCHASE_JOURNAL_COLUMNS);
});

it("rejects invalid attempt identities and states but allows request reuse", async () => {
  const cases: Attempt[] = [
    { ...attempt("b"), attemptId: "sha256:BAD" },
    { ...attempt("d"), operationId: "sha256:BAD" },
    { ...attempt("e"), requestHash: "BAD" },
    { ...attempt("f"), requestCommitment: "sha256:BAD" },
    { ...attempt("1"), challengeId: "sha256:BAD" },
    { ...attempt("2"), purchaseCommitment: "sha256:BAD" },
    { ...attempt("4"), authorizationMode: "bounded-capability" },
    { ...attempt("5"), commitmentVersion: "sotto-human-purchase-v2" },
    { ...attempt("6"), beginExclusive: "-1" },
    { ...attempt("7"), executeBefore: "2000-01-01T00:00:00.000Z" },
    { ...attempt("8"), sourceCommit: "bad" },
    { ...attempt("9"), state: "execution-started" },
  ];
  for (const value of cases)
    await expect(insertAttempt(value)).rejects.toThrow();

  await expect(insertAttempt(attempt("b"))).resolves.toMatch(
    /^sotto-human-purchase-v1-/u,
  );
  await expect(insertAttempt(attempt("d"))).resolves.toMatch(
    /^sotto-human-purchase-v1-/u,
  );
});

it("enforces event and outbox identity and append-only behavior", async () => {
  const value = attempt("e");
  await insertAttempt(value);
  await expect(
    client.query(
      `INSERT INTO sotto.attempt_events
        (attempt_id, sequence, event_type, event_hash)
       VALUES ($1, 2, 'intent-created', $2)`,
      [value.attemptId, sha("e")],
    ),
  ).rejects.toThrow();
  await insertSchemaEvent(client, value);
  await insertSchemaAuthority(client, value);
  await insertSchemaJob(client, value, "018f3f24-7d4a-7e2c-a421-0f3473b98002");
  await expect(
    client.query(
      "UPDATE sotto.attempt_events SET event_type = 'changed' WHERE attempt_id = $1",
      [value.attemptId],
    ),
  ).rejects.toThrow(/append-only/iu);
  await expect(
    client.query("DELETE FROM sotto.attempt_events WHERE attempt_id = $1", [
      value.attemptId,
    ]),
  ).rejects.toThrow(/append-only/iu);
  await expect(
    insertSchemaJob(client, value, "018f3f24-7d4a-7e2c-a421-0f3473b98003"),
  ).rejects.toThrow();
});

it("rolls back the attempt and event when the final job fails", async () => {
  const value = attempt("f");
  await client.query("BEGIN");
  try {
    await insertAttempt(value);
    await insertSchemaEvent(client, value);
    await insertSchemaAuthority(client, value);
    await expect(
      insertSchemaJob(client, value, "not-a-uuid"),
    ).rejects.toThrow();
  } finally {
    await client.query("ROLLBACK");
  }
  const counts = await client.query<{
    attempts: string;
    authorities: string;
    events: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM sotto.purchase_attempts
        WHERE attempt_id = $1) AS attempts,
       (SELECT count(*)::text FROM sotto.private_prepare_authorities
        WHERE attempt_id = $1) AS authorities,
       (SELECT count(*)::text FROM sotto.attempt_events
        WHERE attempt_id = $1) AS events`,
    [value.attemptId],
  );
  expect(counts.rows).toEqual([
    { attempts: "0", authorities: "0", events: "0" },
  ]);
});
