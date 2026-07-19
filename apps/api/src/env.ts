import { createSecretKey, type KeyObject } from "node:crypto";
import {
  readFiveNorthNetworkConfig,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";

type Environment = Readonly<Record<string, string | undefined>>;

export type ApiKeyMaterial = Readonly<{
  activeKeyId: string;
  keys: ReadonlyArray<Readonly<{ id: string; key: KeyObject }>>;
}>;

export type ApiFiveNorthEnvironment = Readonly<{
  config: FiveNorthNetworkConfig;
  dsoAdminParty: string;
  synchronizerId: string;
  transferFactoryContractId: string;
}>;

export type ApiEnvironment = Readonly<{
  cantonExplorerBaseUrl: string | undefined;
  composeModel: string;
  databaseUrl: string;
  deliveryKey: ApiKeyMaterial;
  fiveNorth: ApiFiveNorthEnvironment | undefined;
  openRouterApiKey: string | undefined;
  opsToken: string | undefined;
  port: number;
  prepareAuthorityKey: ApiKeyMaterial;
  publicAppOrigin: string;
  sessionSecret: string;
  signerServiceToken: string;
  signerServiceUrl: string;
  sourceCommit: string;
}>;

const MIN_SECRET_LENGTH = 32;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const CONTRACT_ID = /^[0-9a-f]{2,510}$/u;
const PARTY = /^[^\s:]{1,128}::1220[0-9a-f]{64}$/u;
const SYNCHRONIZER = /^[\x21-\x7e]{1,255}$/u;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const FIVE_NORTH_CONFIG_NAMES = [
  "FIVE_NORTH_LEDGER_URL",
  "FIVE_NORTH_OIDC_AUDIENCE",
  "FIVE_NORTH_OIDC_CLIENT_ID",
  "FIVE_NORTH_OIDC_CLIENT_SECRET",
  "FIVE_NORTH_OIDC_ISSUER_URL",
  "FIVE_NORTH_OIDC_SCOPE",
  "FIVE_NORTH_OIDC_TOKEN_URL",
  "FIVE_NORTH_VALIDATOR_URL",
  "FIVE_NORTH_SYNCHRONIZER_ID",
  "FIVE_NORTH_DSO_ADMIN_PARTY",
  "FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID",
] as const;

function invalid(message: string): never {
  throw new Error(`api environment: ${message}`);
}

function required(source: Environment, name: string): string {
  const value = source[name];
  if (value === undefined || value === "" || value.trim() !== value) {
    invalid(`${name} is required without whitespace padding`);
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      invalid(`${name} must not contain control characters`);
    }
  }
  return value;
}

function requireSecret(source: Environment, name: string): string {
  const value = required(source, name);
  if (value.length < MIN_SECRET_LENGTH) {
    invalid(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return value;
}

function postgresUrl(source: Environment, name: string): string {
  const value = required(source, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid(`${name} must be a valid URL`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    invalid(`${name} must use the postgres scheme`);
  }
  return value;
}

function serviceUrl(source: Environment, name: string): string {
  const value = required(source, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid(`${name} must be a valid URL`);
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    invalid(`${name} must use HTTPS (HTTP is loopback-only)`);
  }
  if (url.search !== "" || url.hash !== "") {
    invalid(`${name} must not carry a query or fragment`);
  }
  return url.toString().replace(/\/$/u, "");
}

function exactOrigin(source: Environment, name: string): string {
  const value = required(source, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    invalid(`${name} must use HTTP or HTTPS`);
  }
  if (url.origin !== value) {
    invalid(`${name} must be an exact origin with no path`);
  }
  return value;
}

function keyMaterial(source: Environment, name: string): ApiKeyMaterial {
  const value = required(source, name);
  const separator = value.indexOf(":");
  if (separator <= 0) {
    invalid(`${name} must use the <keyId>:<base64 key> format`);
  }
  const id = value.slice(0, separator);
  const encoded = value.slice(separator + 1);
  if (!KEY_ID.test(id)) invalid(`${name} key identifier is invalid`);
  if (!BASE64.test(encoded)) invalid(`${name} key bytes must be base64`);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength !== 32 || bytes.toString("base64") !== encoded) {
    invalid(`${name} key must be exactly 32 canonical base64 bytes`);
  }
  return Object.freeze({
    activeKeyId: id,
    keys: Object.freeze([Object.freeze({ id, key: createSecretKey(bytes) })]),
  });
}

function readPort(source: Environment): number {
  const value = source.API_PORT;
  if (value === undefined || value === "") return 4400;
  if (!/^[0-9]{1,5}$/u.test(value)) invalid("API_PORT must be a TCP port");
  const port = Number.parseInt(value, 10);
  if (port < 1 || port > 65_535) invalid("API_PORT must be a TCP port");
  return port;
}

function optional(source: Environment, name: string): string | undefined {
  const value = source[name];
  if (value === undefined || value === "") return undefined;
  return required(source, name);
}

function readFiveNorth(
  source: Environment,
): ApiFiveNorthEnvironment | undefined {
  const present = FIVE_NORTH_CONFIG_NAMES.filter(
    (name) => source[name] !== undefined && source[name] !== "",
  );
  if (present.length === 0) return undefined;
  if (present.length !== FIVE_NORTH_CONFIG_NAMES.length) {
    const missing = FIVE_NORTH_CONFIG_NAMES.filter(
      (name) => !present.includes(name),
    );
    invalid(
      `incomplete Five North configuration, missing ${missing.join(", ")}`,
    );
  }
  const synchronizerId = required(source, "FIVE_NORTH_SYNCHRONIZER_ID");
  if (!SYNCHRONIZER.test(synchronizerId)) {
    invalid("FIVE_NORTH_SYNCHRONIZER_ID is invalid");
  }
  const dsoAdminParty = required(source, "FIVE_NORTH_DSO_ADMIN_PARTY");
  if (!PARTY.test(dsoAdminParty)) {
    invalid("FIVE_NORTH_DSO_ADMIN_PARTY must be a canonical Party");
  }
  const transferFactoryContractId = required(
    source,
    "FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID",
  );
  if (!CONTRACT_ID.test(transferFactoryContractId)) {
    invalid("FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID must be lowercase hex");
  }
  return Object.freeze({
    config: readFiveNorthNetworkConfig(source),
    dsoAdminParty,
    synchronizerId,
    transferFactoryContractId,
  });
}

/**
 * Fail-closed web-api configuration. Every field names its environment
 * variable in its error. The FIVE_NORTH_* set is optional as a whole; when
 * absent, routes that need live DevNet honestly answer 503 instead of
 * pretending. Nothing here fabricates a default secret or network.
 */
export function readApiEnvironment(source: Environment): ApiEnvironment {
  const sourceCommit = required(source, "SOURCE_COMMIT");
  if (!SOURCE_COMMIT.test(sourceCommit)) {
    invalid("SOURCE_COMMIT must be a 40-character lowercase commit hash");
  }
  const explorer = optional(source, "CANTON_EXPLORER_BASE_URL");
  return Object.freeze({
    cantonExplorerBaseUrl:
      explorer === undefined
        ? undefined
        : serviceUrl(source, "CANTON_EXPLORER_BASE_URL"),
    composeModel:
      optional(source, "COMPOSE_MODEL") ?? "anthropic/claude-sonnet-4.5",
    databaseUrl: postgresUrl(source, "DATABASE_URL"),
    deliveryKey: keyMaterial(source, "DELIVERY_KEY"),
    fiveNorth: readFiveNorth(source),
    openRouterApiKey: optional(source, "OPENROUTER_API_KEY"),
    opsToken:
      optional(source, "OPS_TOKEN") === undefined
        ? undefined
        : requireSecret(source, "OPS_TOKEN"),
    port: readPort(source),
    prepareAuthorityKey: keyMaterial(source, "PREPARE_AUTHORITY_KEY"),
    publicAppOrigin: exactOrigin(source, "PUBLIC_APP_ORIGIN"),
    sessionSecret: requireSecret(source, "SESSION_SECRET"),
    signerServiceToken: requireSecret(source, "SIGNER_SERVICE_TOKEN"),
    signerServiceUrl: serviceUrl(source, "SIGNER_SERVICE_URL"),
    sourceCommit,
  });
}
