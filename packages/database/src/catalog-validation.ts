import { createHash } from "node:crypto";
import type { ProviderOriginRegistration } from "./catalog-types.js";
import { hasUnsafeText } from "./text-validation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HOSTNAME =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u;

export type ValidatedProviderOrigin = Readonly<{
  registrationId: string;
  requestHash: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  hostname: string;
  port: number | null;
  normalizedOrigin: string;
}>;

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error(`${label} must be a lowercase UUID`);
  }
  return value;
}

function boundedText(
  value: unknown,
  label: string,
  maximumBytes: number,
  allowSpaces: boolean,
): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    hasUnsafeText(value, allowSpaces)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function normalizeCatalogOrigin(value: unknown): Readonly<{
  hostname: string;
  port: number | null;
  normalizedOrigin: string;
}> {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new Error("catalog origin is invalid");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("catalog origin is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("catalog origin must use HTTPS");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !HOSTNAME.test(url.hostname)
  ) {
    throw new Error("catalog origin must be an exact canonical origin");
  }
  const port = url.port === "" ? null : Number(url.port);
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw new Error("catalog origin port is invalid");
  }
  return Object.freeze({
    hostname: url.hostname,
    port,
    normalizedOrigin: url.origin,
  });
}

export function validateProviderOriginRegistration(
  input: ProviderOriginRegistration,
): ValidatedProviderOrigin {
  const origin = normalizeCatalogOrigin(input?.originUrl);
  const canonical = Object.freeze({
    ownerId: uuid(input?.ownerId, "catalog owner ID"),
    ownerPartyId: boundedText(
      input?.ownerPartyId,
      "catalog owner Party",
      255,
      false,
    ),
    providerId: uuid(input?.providerId, "catalog provider ID"),
    providerDisplayName: boundedText(
      input?.providerDisplayName,
      "catalog provider display name",
      120,
      true,
    ),
    originId: uuid(input?.originId, "catalog origin ID"),
    ...origin,
  });
  const registrationId = uuid(input?.registrationId, "catalog registration ID");
  return Object.freeze({
    registrationId,
    requestHash: createHash("sha256")
      .update(JSON.stringify(canonical), "utf8")
      .digest("hex"),
    ...canonical,
  });
}
