import type { Pool, PoolClient } from "pg";
import { CatalogPersistenceError } from "./catalog-types.js";
import type { PublicPublishedResource } from "./publication-types.js";

type PublicResourceRow = Readonly<{
  resourceId: string;
  resourceRevisionId: string;
  listingVersion: string;
  providerId: string;
  providerDisplayName: string;
  normalizedOrigin: string;
  name: string;
  description: string;
  method: string;
  routeTemplate: string;
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  recipient: string;
  amountAtomic: string;
  transferMethod: string;
  lastVerifiedAt: Date;
}>;

const PUBLIC_RESOURCE_SELECT = `
  SELECT
    resource.id AS "resourceId",
    revision.revision_id AS "resourceRevisionId",
    listing.version::text AS "listingVersion",
    provider.id AS "providerId",
    provider.display_name AS "providerDisplayName",
    origin.normalized_origin AS "normalizedOrigin",
    probe.resource_name AS "name",
    probe.description AS "description",
    resource.http_method AS "method",
    resource.route_template AS "routeTemplate",
    probe.x402_version AS "x402Version",
    probe.scheme AS "scheme",
    probe.network AS "network",
    probe.asset AS "asset",
    probe.recipient AS "recipient",
    probe.amount_atomic::text AS "amountAtomic",
    probe.transfer_method AS "transferMethod",
    probe.observed_at AS "lastVerifiedAt"
  FROM sotto.listings AS listing
  JOIN sotto.resource_revisions AS revision
    ON revision.revision_id = listing.published_revision_id
  JOIN sotto.probe_observations AS probe
    ON probe.observation_id = revision.observation_id
  JOIN sotto.resources AS resource ON resource.id = listing.resource_id
  JOIN sotto.origins AS origin ON origin.id = listing.origin_id
  JOIN sotto.providers AS provider ON provider.id = origin.provider_id
  WHERE listing.state = 'published'
`;

function version(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new CatalogPersistenceError();
  }
  return parsed;
}

function publicResource(row: PublicResourceRow): PublicPublishedResource {
  if (
    row.x402Version !== 2 ||
    row.scheme !== "exact" ||
    row.transferMethod !== "transfer-factory" ||
    !(row.lastVerifiedAt instanceof Date)
  ) {
    throw new CatalogPersistenceError();
  }
  return Object.freeze({
    ...row,
    listingVersion: version(row.listingVersion),
    x402Version: 2,
    scheme: "exact",
    transferMethod: "transfer-factory",
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
  });
}

export async function publicResourceByListing(
  client: PoolClient,
  listingId: string,
): Promise<PublicPublishedResource> {
  const result = await client.query<PublicResourceRow>(
    `${PUBLIC_RESOURCE_SELECT} AND listing.listing_id = $1`,
    [listingId],
  );
  if (result.rows.length !== 1) throw new CatalogPersistenceError();
  return publicResource(result.rows[0]!);
}

export async function publicResourceByPublication(
  client: PoolClient,
  publicationId: string,
): Promise<PublicPublishedResource> {
  const result = await client.query<PublicResourceRow>(
    `SELECT
       resource.id AS "resourceId",
       revision.revision_id AS "resourceRevisionId",
       operation.listing_version::text AS "listingVersion",
       provider.id AS "providerId",
       provider.display_name AS "providerDisplayName",
       origin.normalized_origin AS "normalizedOrigin",
       probe.resource_name AS "name",
       probe.description AS "description",
       resource.http_method AS "method",
       resource.route_template AS "routeTemplate",
       probe.x402_version AS "x402Version",
       probe.scheme AS "scheme",
       probe.network AS "network",
       probe.asset AS "asset",
       probe.recipient AS "recipient",
       probe.amount_atomic::text AS "amountAtomic",
       probe.transfer_method AS "transferMethod",
       probe.observed_at AS "lastVerifiedAt"
     FROM sotto.publication_operations AS operation
     JOIN sotto.resource_revisions AS revision
       ON revision.revision_id = operation.revision_id
     JOIN sotto.probe_observations AS probe
       ON probe.observation_id = revision.observation_id
     JOIN sotto.resources AS resource ON resource.id = operation.resource_id
     JOIN sotto.origins AS origin ON origin.id = operation.origin_id
     JOIN sotto.providers AS provider ON provider.id = origin.provider_id
     WHERE operation.publication_id = $1`,
    [publicationId],
  );
  if (result.rows.length !== 1) throw new CatalogPersistenceError();
  return publicResource(result.rows[0]!);
}

export async function listPublicResources(
  pool: Pool,
): Promise<readonly PublicPublishedResource[]> {
  try {
    const result = await pool.query<PublicResourceRow>(
      `${PUBLIC_RESOURCE_SELECT}
       ORDER BY listing.updated_at DESC, listing.listing_id
       LIMIT 100`,
    );
    return Object.freeze(result.rows.map(publicResource));
  } catch (error) {
    if (error instanceof CatalogPersistenceError) throw error;
    throw new CatalogPersistenceError();
  }
}
