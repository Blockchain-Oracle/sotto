import { createSecretKey, type KeyObject } from "node:crypto";
import {
  readFiveNorthNetworkConfig,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";

type Environment = Readonly<Record<string, string | undefined>>;

export type WorkerKeyMaterial = Readonly<{
  activeKeyId: string;
  keys: ReadonlyArray<Readonly<{ id: string; key: KeyObject }>>;
}>;

export type WorkerEnvironment = Readonly<{
  databaseUrl: string;
  humanWalletPublicKeys: ReadonlyMap<string, Buffer>;
  leaseOwner: string;
  network: FiveNorthNetworkConfig;
  prepareAuthorityKey: WorkerKeyMaterial;
  privateDeliveryKey: WorkerKeyMaterial;
  signerServiceToken: string;
  signerServiceUrl: string;
  sourceCommit: string;
}>;

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }
  if (value.trim() !== value || hasControlCharacter(value)) {
    throw new Error(`${name} must not contain whitespace padding or controls`);
  }
  return value;
}

function boundedText(
  environment: Environment,
  name: string,
  maximumBytes: number,
): string {
  const value = required(environment, name);
  if (Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`${name} exceeds ${maximumBytes} bytes`);
  }
  return value;
}

function postgresUrl(environment: Environment, name: string): string {
  const value = required(environment, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must use the postgres scheme`);
  }
  return value;
}

function signerUrl(environment: Environment, name: string): string {
  const value = required(environment, name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname) || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(`${name} must use HTTPS (HTTP is loopback-only)`);
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error(`${name} must not carry a query or fragment`);
  }
  return url.toString().replace(/\/$/u, "");
}

function keyMaterial(
  environment: Environment,
  name: string,
): WorkerKeyMaterial {
  const value = required(environment, name);
  const separator = value.indexOf(":");
  if (separator <= 0) {
    throw new Error(`${name} must use the <keyId>:<base64 key> format`);
  }
  const id = value.slice(0, separator);
  const encoded = value.slice(separator + 1);
  if (!KEY_ID.test(id)) {
    throw new Error(`${name} key identifier is invalid`);
  }
  if (!BASE64.test(encoded)) {
    throw new Error(`${name} key bytes must be canonical base64`);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength !== 32 || bytes.toString("base64") !== encoded) {
    throw new Error(`${name} key must be exactly 32 canonical base64 bytes`);
  }
  return Object.freeze({
    activeKeyId: id,
    keys: Object.freeze([Object.freeze({ id, key: createSecretKey(bytes) })]),
  });
}

function sourceCommit(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (!SOURCE_COMMIT.test(value)) {
    throw new Error(`${name} must be a 40-character lowercase commit hash`);
  }
  return value;
}

function humanWalletPublicKeys(
  environment: Environment,
  name: string,
): ReadonlyMap<string, Buffer> {
  const value = environment[name];
  const keys = new Map<string, Buffer>();
  if (value === undefined || value.trim() === "") return keys;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be a JSON object`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }
  for (const [fingerprint, encoded] of Object.entries(parsed)) {
    if (!FINGERPRINT.test(fingerprint)) {
      throw new Error(`${name} fingerprint keys must be 1220-prefixed hex`);
    }
    if (typeof encoded !== "string" || !BASE64.test(encoded)) {
      throw new Error(`${name} public keys must be canonical base64`);
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.byteLength !== 32 || bytes.toString("base64") !== encoded) {
      throw new Error(`${name} public keys must be 32 raw Ed25519 bytes`);
    }
    keys.set(fingerprint, bytes);
  }
  return keys;
}

/**
 * Fail-closed worker configuration. Every field names its exact environment
 * variable in its error so operators can repair configuration without
 * reading source. `HUMAN_WALLET_PUBLIC_KEYS` is optional registration
 * material for verifying human wallet signatures; every entry is
 * re-fingerprinted cryptographically before use.
 */
export function readWorkerEnvironment(
  environment: Environment,
): WorkerEnvironment {
  return Object.freeze({
    databaseUrl: postgresUrl(environment, "DATABASE_URL"),
    humanWalletPublicKeys: humanWalletPublicKeys(
      environment,
      "HUMAN_WALLET_PUBLIC_KEYS",
    ),
    leaseOwner: boundedText(environment, "WORKER_LEASE_OWNER", 128),
    network: readFiveNorthNetworkConfig(environment),
    prepareAuthorityKey: keyMaterial(environment, "PREPARE_AUTHORITY_KEY"),
    privateDeliveryKey: keyMaterial(environment, "DELIVERY_KEY"),
    signerServiceToken: boundedText(environment, "SIGNER_SERVICE_TOKEN", 4_096),
    signerServiceUrl: signerUrl(environment, "SIGNER_SERVICE_URL"),
    sourceCommit: sourceCommit(environment, "SOURCE_COMMIT"),
  });
}
