import type { FastifyInstance } from "fastify";
import type { ApiDependencies } from "../dependencies.js";

/**
 * Public catalog surface — no session required. Every row is a persisted,
 * server-verified resource; an empty catalog answers an honest empty
 * array, never sample data.
 */
export function registerCatalogRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  server.get("/v1/resources", async () => ({
    resources: await deps.catalog.listResources(),
  }));

  server.get("/v1/resources/:listingId", async (request, reply) => {
    const { listingId } = request.params as Readonly<{ listingId: string }>;
    const resource = await deps.catalog.resourceByListing(listingId);
    if (resource === null) {
      return reply.status(404).send({
        error: "resource-unknown",
        detail:
          "No published resource matches this listing. Browse /v1/resources " +
          "for the verified catalog.",
      });
    }
    return reply.send({ resource });
  });

  server.get("/v1/resources/:listingId/health", async (request, reply) => {
    const { listingId } = request.params as Readonly<{ listingId: string }>;
    const resource = await deps.catalog.resourceByListing(listingId);
    if (resource === null) {
      return reply.status(404).send({
        error: "resource-unknown",
        detail:
          "No published resource matches this listing. Browse /v1/resources " +
          "for the verified catalog.",
      });
    }
    const health = await deps.catalog.latestHealth(resource.resourceId);
    // A resource with no observations yet reports null honestly instead of
    // synthesizing a "healthy" default.
    return reply.send({ resourceId: resource.resourceId, health });
  });
}
