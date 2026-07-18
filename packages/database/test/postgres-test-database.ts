import { Client } from "pg";

const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const ADMIN_TIMEOUT_MS = 30_000;

function databaseUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function runAdmin(baseUrl: string, sql: string): Promise<void> {
  const client = new Client({
    connectionString: databaseUrl(baseUrl, "postgres"),
    connectionTimeoutMillis: ADMIN_TIMEOUT_MS,
    query_timeout: ADMIN_TIMEOUT_MS,
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function createPostgresTestDatabase(
  name: string,
): Promise<Readonly<{ databaseUrl: string; drop(): Promise<void> }>> {
  if (!DATABASE_NAME.test(name)) {
    throw new Error("PostgreSQL test database name is invalid");
  }
  const baseUrl = process.env.SOTTO_TEST_DATABASE_URL ?? "";
  await runAdmin(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await runAdmin(baseUrl, `CREATE DATABASE ${name}`);
  return Object.freeze({
    databaseUrl: databaseUrl(baseUrl, name),
    drop: () =>
      runAdmin(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  });
}
