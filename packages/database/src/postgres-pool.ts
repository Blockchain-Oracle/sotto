import { Pool } from "pg";

const APPLICATION_NAME = /^[a-z][a-z0-9_-]{0,62}$/u;
const TLS_URL_PARAMETERS = new Set([
  "ssl",
  "sslmode",
  "sslnegotiation",
  "sslcert",
  "sslkey",
  "sslrootcert",
]);

export type PostgresPoolInput<Event> = Readonly<{
  databaseUrl: string;
  maxConnections?: number;
  applicationName?: string;
  onOperationalError?: (event: Event) => void | Promise<void>;
}>;

export type PostgresPoolProfile<Event> = Readonly<{
  label: string;
  defaultApplicationName: string;
  poolError: Event;
}>;

function databaseUrl(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 8_192
  ) {
    throw new Error(`${label} database URL is invalid`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} database URL is invalid`);
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol) ||
    parsed.hostname === "" ||
    parsed.username === "" ||
    parsed.pathname.length < 2 ||
    parsed.hash !== ""
  ) {
    throw new Error(`${label} database URL is invalid`);
  }
  const seen = new Set<string>();
  for (const [key] of parsed.searchParams) {
    if (!TLS_URL_PARAMETERS.has(key) || seen.has(key)) {
      throw new Error(`${label} database URL parameters are invalid`);
    }
    seen.add(key);
  }
  return value;
}

function poolFor<Event>(
  input: PostgresPoolInput<Event>,
  profile: PostgresPoolProfile<Event>,
): Pool {
  const maximum = input.maxConnections ?? 8;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 16) {
    throw new Error(
      `${profile.label} connection limit must be between 1 and 16`,
    );
  }
  const applicationName =
    input.applicationName ?? profile.defaultApplicationName;
  if (!APPLICATION_NAME.test(applicationName)) {
    throw new Error(`${profile.label} application name is invalid`);
  }
  const pool = new Pool({
    connectionString: databaseUrl(input.databaseUrl, profile.label),
    application_name: applicationName,
    max: maximum,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    lock_timeout: 5_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
  });
  pool.on("error", () => {
    try {
      const reporting = input.onOperationalError?.(profile.poolError);
      if (reporting !== undefined) {
        void Promise.resolve(reporting).catch(() => undefined);
      }
    } catch {
      // Operational reporting cannot terminate the process.
    }
  });
  return pool;
}

export type PostgresPoolRuntime = Readonly<{
  pool: Pool;
  admit(): () => void;
  close(): Promise<void>;
}>;

export function createPostgresPoolRuntime<Event>(
  input: PostgresPoolInput<Event>,
  profile: PostgresPoolProfile<Event>,
): PostgresPoolRuntime {
  const pool = poolFor(input, profile);
  let closing = false;
  let active = 0;
  let closePromise: Promise<void> | undefined;
  let resolveDrain: (() => void) | undefined;
  const admit = () => {
    if (closing) throw new Error(`${profile.label} repository is closed`);
    active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
      if (closing && active === 0) resolveDrain?.();
    };
  };
  const waitForDrain = () =>
    active === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          resolveDrain = resolve;
        });
  const close = () => {
    if (closePromise !== undefined) return closePromise;
    closing = true;
    closePromise = (async () => {
      await waitForDrain();
      await pool.end();
    })();
    return closePromise;
  };
  return Object.freeze({ pool, admit, close });
}
