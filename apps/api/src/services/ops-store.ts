import type { Pool } from "pg";

export type OpsListingRow = Readonly<{
  listingId: string;
  state: string;
  version: number;
  resourceId: string;
  method: string;
  routeTemplate: string;
  normalizedOrigin: string;
  providerDisplayName: string;
  latestHealthStatus: string | null;
  latestHealthObservedAt: string | null;
}>;

export type OpsStore = Readonly<{
  listListings(): Promise<readonly OpsListingRow[]>;
  setListingState(
    listingId: string,
    state: "published" | "quarantined",
  ): Promise<"updated" | "unknown">;
}>;

/**
 * Operator review surface. Listing quarantine uses the states the
 * publication schema already defines ('published' ↔ 'quarantined'); the
 * update is refused for any listing outside those two states so pause and
 * unpublish semantics stay with their own future flows.
 */
export function createOpsStore(pool: Pool): OpsStore {
  return Object.freeze({
    listListings: async () => {
      const result = await pool.query<{
        listingId: string;
        state: string;
        version: string;
        resourceId: string;
        method: string;
        routeTemplate: string;
        normalizedOrigin: string;
        providerDisplayName: string;
        latestHealthStatus: string | null;
        latestHealthObservedAt: Date | null;
      }>(
        `SELECT listing.listing_id AS "listingId", listing.state,
                listing.version::text AS "version",
                resource.id AS "resourceId",
                resource.http_method AS "method",
                resource.route_template AS "routeTemplate",
                origin.normalized_origin AS "normalizedOrigin",
                provider.display_name AS "providerDisplayName",
                health.status AS "latestHealthStatus",
                health.observed_at AS "latestHealthObservedAt"
         FROM sotto.listings listing
         JOIN sotto.resources resource ON resource.id = listing.resource_id
         JOIN sotto.origins origin ON origin.id = listing.origin_id
         JOIN sotto.providers provider ON provider.id = origin.provider_id
         LEFT JOIN LATERAL (
           SELECT status, observed_at FROM sotto.health_observations
           WHERE resource_id = resource.id
           ORDER BY observed_at DESC LIMIT 1
         ) health ON true
         ORDER BY listing.updated_at DESC
         LIMIT 200`,
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            ...row,
            version: Number(row.version),
            latestHealthObservedAt:
              row.latestHealthObservedAt?.toISOString() ?? null,
          }),
        ),
      );
    },
    setListingState: async (listingId, state) => {
      const result = await pool.query(
        `UPDATE sotto.listings
         SET state = $2, updated_at = clock_timestamp()
         WHERE listing_id = $1
           AND state IN ('published', 'quarantined')
           AND state <> $2`,
        [listingId, state],
      );
      return (result.rowCount ?? 0) > 0 ? "updated" : "unknown";
    },
  });
}
