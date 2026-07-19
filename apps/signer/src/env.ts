import { lstatSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  readFiveNorthNetworkConfig,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";

export type SignerEnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

export type SignerFiveNorthEnvironment = Readonly<{
  config: FiveNorthNetworkConfig;
  environment: Readonly<Record<string, string>>;
  synchronizerId: string;
}>;

export type SignerEnvironment = Readonly<{
  fiveNorth: SignerFiveNorthEnvironment | undefined;
  keyDirectory: string;
  port: number;
  publicWalletOrigin: string;
  serviceToken: string;
  walletSessionSecret: string;
}>;

const MIN_SECRET_LENGTH = 32;
const FIVE_NORTH_CONFIG_NAMES = [
  "FIVE_NORTH_LEDGER_URL",
  "FIVE_NORTH_OIDC_AUDIENCE",
  "FIVE_NORTH_OIDC_CLIENT_ID",
  "FIVE_NORTH_OIDC_CLIENT_SECRET",
  "FIVE_NORTH_OIDC_ISSUER_URL",
  "FIVE_NORTH_OIDC_SCOPE",
  "FIVE_NORTH_OIDC_TOKEN_URL",
  "FIVE_NORTH_VALIDATOR_URL",
] as const;
const SYNCHRONIZER_PATTERN = /^[\x21-\x7e]{1,255}$/u;

function invalid(message: string): never {
  throw new Error(`signer environment: ${message}`);
}

function requireSecret(source: SignerEnvironmentSource, name: string): string {
  const value = source[name];
  if (value === undefined || value.trim() !== value || value === "") {
    invalid(`${name} is required`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    invalid(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return value;
}

function requireOwnerOnlyDirectory(candidate: string): string {
  const path = resolve(candidate);
  let status;
  try {
    status = lstatSync(path);
  } catch {
    mkdirSync(path, { mode: 0o700 });
    status = lstatSync(path);
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    invalid("SIGNER_KEY_DIR must be a directory, not a symbolic link");
  }
  if ((status.mode & 0o777) !== 0o700) {
    invalid("SIGNER_KEY_DIR must use mode 0700");
  }
  if (typeof process.getuid === "function" && status.uid !== process.getuid()) {
    invalid("SIGNER_KEY_DIR must be owned by the signer user");
  }
  return path;
}

function requireKeyDirectory(source: SignerEnvironmentSource): string {
  const value = source.SIGNER_KEY_DIR;
  if (value === undefined || value === "") {
    invalid("SIGNER_KEY_DIR is required");
  }
  if (resolve(value) !== value) {
    invalid("SIGNER_KEY_DIR must be an absolute path");
  }
  return requireOwnerOnlyDirectory(value);
}

function requirePublicWalletOrigin(source: SignerEnvironmentSource): string {
  const value = source.PUBLIC_WALLET_ORIGIN;
  if (value === undefined || value === "") {
    invalid("PUBLIC_WALLET_ORIGIN is required");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid("PUBLIC_WALLET_ORIGIN must be a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    invalid("PUBLIC_WALLET_ORIGIN must use HTTP or HTTPS");
  }
  if (url.origin !== value) {
    invalid("PUBLIC_WALLET_ORIGIN must be an exact origin with no path");
  }
  return value;
}

function readPort(source: SignerEnvironmentSource): number {
  const value = source.SIGNER_PORT;
  if (value === undefined || value === "") return 4402;
  if (!/^[0-9]{1,5}$/u.test(value)) {
    invalid("SIGNER_PORT must be a TCP port number");
  }
  const port = Number.parseInt(value, 10);
  if (port < 1 || port > 65_535) {
    invalid("SIGNER_PORT must be a TCP port number");
  }
  return port;
}

function readFiveNorth(
  source: SignerEnvironmentSource,
): SignerFiveNorthEnvironment | undefined {
  const present = FIVE_NORTH_CONFIG_NAMES.filter(
    (name) => source[name] !== undefined && source[name] !== "",
  );
  const synchronizerId = source.FIVE_NORTH_SYNCHRONIZER_ID;
  if (present.length === 0) {
    if (synchronizerId !== undefined && synchronizerId !== "") {
      invalid("FIVE_NORTH_SYNCHRONIZER_ID requires the FIVE_NORTH_* set");
    }
    return undefined;
  }
  if (present.length !== FIVE_NORTH_CONFIG_NAMES.length) {
    const missing = FIVE_NORTH_CONFIG_NAMES.filter(
      (name) => !present.includes(name),
    );
    invalid(
      `incomplete Five North configuration, missing ${missing.join(", ")}`,
    );
  }
  if (
    synchronizerId === undefined ||
    !SYNCHRONIZER_PATTERN.test(synchronizerId)
  ) {
    invalid("FIVE_NORTH_SYNCHRONIZER_ID is required with the FIVE_NORTH_* set");
  }
  const environment: Record<string, string> = {};
  for (const name of FIVE_NORTH_CONFIG_NAMES) {
    environment[name] = source[name]!;
  }
  return Object.freeze({
    config: readFiveNorthNetworkConfig(environment),
    environment: Object.freeze(environment),
    synchronizerId,
  });
}

export function readSignerEnvironment(
  source: SignerEnvironmentSource,
): SignerEnvironment {
  return Object.freeze({
    fiveNorth: readFiveNorth(source),
    keyDirectory: requireKeyDirectory(source),
    port: readPort(source),
    publicWalletOrigin: requirePublicWalletOrigin(source),
    serviceToken: requireSecret(source, "SIGNER_SERVICE_TOKEN"),
    walletSessionSecret: requireSecret(source, "WALLET_SESSION_SECRET"),
  });
}
