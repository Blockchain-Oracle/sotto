import type { Pool } from "pg";
import {
  listPublicResources,
  publicResourceByListing,
  findLatestResourceHealth,
  type PublicPublishedResource,
  type ResourceHealthObservation,
} from "@sotto/database";

/**
 * Read-only catalog surface consumed by the public routes. The composition
 * root backs it with PostgreSQL; unit tests inject fakes. Empty catalogs
 * return empty arrays — never seeded rows.
 */
export type CatalogReads = Readonly<{
  listResources(): Promise<readonly PublicPublishedResource[]>;
  resourceByListing(listingId: string): Promise<PublicPublishedResource | null>;
  latestHealth(resourceId: string): Promise<ResourceHealthObservation | null>;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function createCatalogReads(pool: Pool): CatalogReads {
  return Object.freeze({
    listResources: () => listPublicResources(pool),
    resourceByListing: async (listingId) => {
      if (!isUuid(listingId)) return null;
      const client = await pool.connect();
      try {
        return await publicResourceByListing(client, listingId);
      } catch {
        // The query layer throws when the listing is absent or unpublished;
        // the route answers an honest 404 either way.
        return null;
      } finally {
        client.release();
      }
    },
    latestHealth: async (resourceId) => {
      if (!isUuid(resourceId)) return null;
      return findLatestResourceHealth(pool, resourceId);
    },
  });
}
