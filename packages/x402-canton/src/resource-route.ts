import { sha256Hex } from "./purchase-commitment-primitives.js";

export const RESOURCE_BINDING_VERSION = "sotto-resource-v1" as const;
const MAX_RESOURCE_URL_BYTES = 4_096;

export function commitResourceRoute(value: string): `sha256:${string}` {
  if (
    typeof value !== "string" ||
    value === "" ||
    new TextEncoder().encode(value).byteLength > MAX_RESOURCE_URL_BYTES
  ) {
    throw new Error("resource URL is invalid");
  }
  let resource: URL;
  try {
    resource = new URL(value);
  } catch {
    throw new Error("resource URL is invalid");
  }
  if (
    resource.protocol !== "https:" ||
    resource.username !== "" ||
    resource.password !== "" ||
    resource.hash !== ""
  ) {
    throw new Error("resource URL must be safe HTTPS");
  }
  return `sha256:${sha256Hex(
    JSON.stringify({
      version: RESOURCE_BINDING_VERSION,
      origin: resource.origin,
      pathname: resource.pathname,
    }),
  )}`;
}
