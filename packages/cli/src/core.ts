import {
  createSottoClient,
  type CatalogResource,
  type FetchLike,
  type SottoClient,
} from "@sotto/purchase-client";
import { resolveSettings, type Env, type ResolvedSettings } from "./config.js";

export class CliUsageError extends Error {}
export class CliAuthError extends Error {}

export type ClientContext = Readonly<{
  client: SottoClient;
  settings: ResolvedSettings;
}>;

/**
 * Builds the shared purchasing-core client from resolved settings. Every
 * CLI command and MCP tool goes through this one construction — there is
 * no second HTTP path and no signing capability anywhere behind it.
 */
export function buildClient(
  env: Env,
  flags: Readonly<{ apiOrigin?: string }> = {},
  fetchImpl?: FetchLike,
): ClientContext {
  const settings = resolveSettings(env, flags);
  if (settings.apiOrigin === undefined) {
    throw new CliUsageError(
      "No API origin is configured. Set SOTTO_API_ORIGIN, pass " +
        "--api-origin, or run `sotto login --api-origin <url> --token <token>`.",
    );
  }
  const client = createSottoClient({
    origin: settings.apiOrigin,
    token: () => settings.token,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
  return Object.freeze({ client, settings });
}

export function requireToken(settings: ResolvedSettings): string {
  if (settings.token === undefined) {
    throw new CliAuthError(
      "No owner session token is configured. Copy the session token from " +
        "the Sotto app (or the /v1/session/verify response) and run " +
        "`sotto login --token <token>`, or export SOTTO_SESSION_TOKEN.",
    );
  }
  return settings.token;
}

export type SearchFilters = Readonly<{
  query?: string;
  method?: string;
  maxPriceAtomic?: bigint;
}>;

/** Case-insensitive text match over the verified catalog's own fields. */
export function filterResources(
  resources: readonly CatalogResource[],
  filters: SearchFilters,
): readonly CatalogResource[] {
  const query = filters.query?.toLowerCase();
  return resources.filter((resource) => {
    if (
      filters.method !== undefined &&
      resource.method.toUpperCase() !== filters.method.toUpperCase()
    ) {
      return false;
    }
    if (
      filters.maxPriceAtomic !== undefined &&
      BigInt(resource.amountAtomic) > filters.maxPriceAtomic
    ) {
      return false;
    }
    if (query === undefined || query === "") return true;
    return [
      resource.name,
      resource.description,
      resource.providerDisplayName,
      resource.normalizedOrigin,
      resource.routeTemplate,
      resource.method,
    ]
      .join("\n")
      .toLowerCase()
      .includes(query);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Resolves a listing ID or a canonical resource URL to its verified
 * catalog listing — the `sotto try <resource-url>` path. A URL matches
 * when origin and route equal a published resource exactly.
 */
export async function resolveResource(
  client: SottoClient,
  reference: string,
  signal?: AbortSignal,
): Promise<CatalogResource> {
  if (UUID.test(reference)) {
    return client.catalog.resourceByListing(reference, signal);
  }
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new CliUsageError(
      `"${reference}" is neither a listing ID nor a resource URL. Pass the ` +
        "listing ID from `sotto search` or the resource's canonical URL.",
    );
  }
  const resources = await client.catalog.listResources(signal);
  const match = resources.find(
    (resource) =>
      resource.normalizedOrigin === url.origin &&
      resource.routeTemplate === url.pathname,
  );
  if (match === undefined) {
    throw new CliUsageError(
      `No verified resource matches ${url.origin}${url.pathname}. Browse ` +
        "`sotto search` for the published catalog.",
    );
  }
  return match;
}

export function parseMaxPrice(raw: string | undefined): bigint | undefined {
  if (raw === undefined) return undefined;
  if (!/^[0-9]{1,38}$/u.test(raw)) {
    throw new CliUsageError(
      "--max-price takes an atomic-unit integer (the catalog's amountAtomic).",
    );
  }
  return BigInt(raw);
}
