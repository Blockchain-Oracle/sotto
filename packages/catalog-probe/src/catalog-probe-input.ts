import type { CatalogProbeInput } from "./catalog-probe-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function hasUnsafeText(value: string, spaces: boolean): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return (
    /\p{Cf}/u.test(value) ||
    (spaces ? /[^\S ]/u.test(value) : /\s/u.test(value))
  );
}

function text(
  value: unknown,
  label: string,
  maximumBytes: number,
  spaces = false,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximumBytes ||
    hasUnsafeText(value, spaces)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error(`${label} must be a lowercase UUID`);
  }
  return value;
}

export function validateCatalogProbeInput(
  candidate: CatalogProbeInput,
): CatalogProbeInput {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.getPrototypeOf(candidate) !== Object.prototype
  ) {
    throw new Error("catalog probe input must be a plain object");
  }
  const input = candidate as Record<string, unknown>;
  const expected = [
    "description",
    "method",
    "name",
    "observationId",
    "originId",
    "resourceId",
    "revisionId",
    "routeTemplate",
  ].sort();
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(expected)) {
    throw new Error("catalog probe input keys are invalid");
  }
  const method = text(input.method, "catalog probe method", 8);
  const route = text(input.routeTemplate, "catalog probe route", 2_048);
  if (method !== "GET" || !route.startsWith("/") || /[?#]/u.test(route)) {
    throw new Error("catalog probe input is invalid");
  }
  return Object.freeze({
    description: text(
      input.description,
      "catalog probe description",
      2_000,
      true,
    ),
    method: "GET",
    name: text(input.name, "catalog probe name", 120, true),
    observationId: uuid(input.observationId, "catalog probe observation ID"),
    originId: uuid(input.originId, "catalog probe origin ID"),
    resourceId: uuid(input.resourceId, "catalog probe resource ID"),
    revisionId: uuid(input.revisionId, "catalog probe revision ID"),
    routeTemplate: route,
  });
}
