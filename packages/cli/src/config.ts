import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const TOKEN = /^[0-9a-f]{64}$/u;

export type CliConfig = Readonly<{
  apiOrigin?: string;
  token?: string;
  walletUrl?: string;
}>;

export type Env = Readonly<Record<string, string | undefined>>;

export function configPath(env: Env): string {
  const base =
    env.SOTTO_CONFIG_DIR ??
    join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "sotto");
  return join(base, "config.json");
}

/** Malformed config fails closed: the CLI treats it as absent and says so. */
export function readConfig(env: Env): CliConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath(env), "utf8");
  } catch {
    return Object.freeze({});
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Object.freeze({});
  }
  if (typeof parsed !== "object" || parsed === null) return Object.freeze({});
  const record = parsed as Record<string, unknown>;
  return Object.freeze({
    ...(typeof record.apiOrigin === "string"
      ? { apiOrigin: record.apiOrigin }
      : {}),
    ...(typeof record.token === "string" && TOKEN.test(record.token)
      ? { token: record.token }
      : {}),
    ...(typeof record.walletUrl === "string"
      ? { walletUrl: record.walletUrl }
      : {}),
  });
}

/**
 * Persists the config with owner-only permissions: 0700 directory, 0600
 * file — the session token never becomes group- or world-readable, and an
 * existing looser mode is tightened on every write.
 */
export function writeConfig(env: Env, config: CliConfig): string {
  const path = configPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return path;
}

export function deleteConfig(env: Env): void {
  rmSync(configPath(env), { force: true });
}

export type ResolvedSettings = Readonly<{
  apiOrigin: string | undefined;
  token: string | undefined;
  walletUrl: string | undefined;
  tokenSource: "env" | "config" | "absent";
}>;

/** Environment overrides config; explicit flags override both. */
export function resolveSettings(
  env: Env,
  flags: Readonly<{ apiOrigin?: string }> = {},
): ResolvedSettings {
  const config = readConfig(env);
  const envToken = env.SOTTO_SESSION_TOKEN;
  const token =
    envToken !== undefined && TOKEN.test(envToken) ? envToken : config.token;
  return Object.freeze({
    apiOrigin: flags.apiOrigin ?? env.SOTTO_API_ORIGIN ?? config.apiOrigin,
    token,
    walletUrl: env.SOTTO_WALLET_URL ?? config.walletUrl,
    tokenSource:
      envToken !== undefined && TOKEN.test(envToken)
        ? "env"
        : config.token !== undefined
          ? "config"
          : "absent",
  });
}

export function isValidToken(candidate: string): boolean {
  return TOKEN.test(candidate);
}
