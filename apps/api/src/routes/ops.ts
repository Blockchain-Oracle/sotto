import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiDependencies } from "../dependencies.js";
import { isUuid } from "../services/catalog-reads.js";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function bearerMatches(request: FastifyRequest, token: string): boolean {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return false;
  }
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(token));
}

/**
 * Operator surface behind its own bearer token — deliberately separate
 * from owner sessions so a leaked operator credential never becomes a
 * buyer identity and vice versa. Quarantine flips only the listing states
 * the schema defines; everything the data layer cannot express answers
 * 501.
 */
export function registerOpsRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (deps.opsToken === undefined) {
      await reply.status(503).send({
        error: "ops-unavailable",
        detail:
          "No OPS_TOKEN is configured, so the operator surface is off. " +
          "Configure the token to enable review.",
      });
      return;
    }
    if (!bearerMatches(request, deps.opsToken)) {
      await reply.status(401).send({
        error: "ops-token-required",
        detail:
          "Present the operator bearer token. Owner sessions do not grant " +
          "operator review.",
      });
    }
  };

  server.get("/v1/ops/listings", { preHandler: guard }, async () => ({
    listings: await deps.ops.listListings(),
  }));

  server.post(
    "/v1/ops/listings/:listingId/quarantine",
    { preHandler: guard },
    async (request, reply) => {
      const { listingId } = request.params as Readonly<{ listingId: string }>;
      if (!isUuid(listingId)) {
        return reply
          .status(404)
          .send({ error: "listing-unknown", detail: "Unknown listing ID." });
      }
      const outcome = await deps.ops.setListingState(listingId, "quarantined");
      if (outcome === "unknown") {
        return reply.status(409).send({
          error: "listing-not-quarantinable",
          detail:
            "The listing is absent or in a state this transition does not " +
            "cover. Review the listing state first.",
        });
      }
      return reply.send({ listingId, state: "quarantined" });
    },
  );

  server.post(
    "/v1/ops/listings/:listingId/restore",
    { preHandler: guard },
    async (request, reply) => {
      const { listingId } = request.params as Readonly<{ listingId: string }>;
      if (!isUuid(listingId)) {
        return reply
          .status(404)
          .send({ error: "listing-unknown", detail: "Unknown listing ID." });
      }
      const outcome = await deps.ops.setListingState(listingId, "published");
      if (outcome === "unknown") {
        return reply.status(409).send({
          error: "listing-not-restorable",
          detail:
            "The listing is absent or not quarantined. Review the listing " +
            "state first.",
        });
      }
      return reply.send({ listingId, state: "published" });
    },
  );

  server.post(
    "/v1/ops/attempts/:attemptId/review",
    { preHandler: guard },
    async (_request, reply) =>
      reply.status(501).send({
        error: "not-implemented",
        detail:
          "Attempt-level operator review has no data-layer support yet; " +
          "nothing is marked reviewed.",
      }),
  );
}
