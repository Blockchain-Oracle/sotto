import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ApiDependencies } from "../dependencies.js";
import { readSessionToken } from "../auth/session.js";
import { projectAttemptEvidence } from "../services/evidence-projection.js";
import { isAttemptId } from "../services/purchase-reads.js";

/**
 * Public Scan surface. The feed lists only Sotto-attributed attempts from
 * the journal; detail pairs settlement and delivery facts with a
 * source-labeled timeline. Q-004: the session owner sees the full receipt,
 * everyone else the redacted projection — and an attempt that is not yours
 * is indistinguishable from one that never existed (404 either way).
 */
export function registerScanRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  server.get("/v1/attempts", async (request, reply) => {
    const rawLimit = (request.query as Record<string, unknown>).limit;
    const limit =
      typeof rawLimit === "string" && /^[0-9]{1,3}$/u.test(rawLimit)
        ? Number(rawLimit)
        : 50;
    const attempts = await deps.purchaseReads.listPublicAttempts(limit);
    return reply.send({ attempts });
  });

  async function viewerOwnerId(
    request: FastifyRequest,
  ): Promise<string | null> {
    const token = readSessionToken(request);
    if (token === undefined) return null;
    const session = await deps.sessions.findByToken(token);
    return session?.ownerId ?? null;
  }

  server.get("/v1/attempts/:attemptId", async (request, reply) => {
    const { attemptId } = request.params as Readonly<{ attemptId: string }>;
    const publicRow = isAttemptId(attemptId)
      ? await deps.purchaseReads.publicAttemptById(attemptId)
      : null;
    if (publicRow === null) {
      return reply.status(404).send({
        error: "attempt-unknown",
        detail: "No Sotto-attributed attempt matches this ID.",
      });
    }
    const [aggregate, events, settlement, delivery, ownerId] =
      await Promise.all([
        deps.purchaseReads.aggregateByAttemptId(attemptId),
        deps.purchaseReads.eventsSince(attemptId, 0),
        deps.purchaseReads.settlementFacts(attemptId),
        deps.purchaseReads.deliveryFacts(attemptId),
        viewerOwnerId(request),
      ]);
    const viewer =
      ownerId !== null && aggregate !== null && aggregate.ownerId === ownerId
        ? ("owner" as const)
        : ("public" as const);
    return reply.send({
      attempt: projectAttemptEvidence({
        viewer,
        publicRow,
        aggregate,
        events,
        settlement,
        delivery,
        explorerBaseUrl: deps.cantonExplorerBaseUrl,
      }),
    });
  });
}
