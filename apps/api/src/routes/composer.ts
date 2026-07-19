import type { FastifyInstance } from "fastify";
import type { ApiDependencies } from "../dependencies.js";
import { requireSession, sessionOf } from "../auth/session.js";
import { isAttemptId } from "../services/purchase-reads.js";

const MAX_LIST_LIMIT = 100;

function body(request: { body: unknown }): Record<string, unknown> {
  const value = request.body;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Composer surface, session-required. Initiation observes the live 402 and
 * journals a real intent; reads project the owner's attempts with
 * settlement and delivery kept separate (Q-004). The worker owns every
 * transition after intent-created.
 */
export function registerComposerRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  const guard = { preHandler: requireSession(deps.sessions) };

  server.post("/v1/purchases", guard, async (request, reply) => {
    const listingId = body(request).listingId;
    if (typeof listingId !== "string") {
      return reply.status(400).send({
        error: "listing-id-missing",
        detail: "Provide the listingId of the verified resource to purchase.",
      });
    }
    const session = sessionOf(request);
    const outcome = await deps.initiation.initiate({
      listingId,
      session: { ownerId: session.ownerId, partyId: session.partyId },
      signal: AbortSignal.timeout(120_000),
    });
    return reply.status(outcome.status).send(outcome.body);
  });

  server.get("/v1/purchases", guard, async (request, reply) => {
    const session = sessionOf(request);
    const rawLimit = (request.query as Record<string, unknown>).limit;
    const limit =
      typeof rawLimit === "string" && /^[0-9]{1,3}$/u.test(rawLimit)
        ? Math.min(Math.max(Number(rawLimit), 1), MAX_LIST_LIMIT)
        : 50;
    const attempts = await deps.purchaseReads.listForOwner(
      session.ownerId,
      limit,
    );
    return reply.send({
      attempts: attempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        state: attempt.state,
        createdAt: attempt.createdAt,
        executeBefore: attempt.executeBefore,
        commandId: attempt.commandId,
        resourceRevisionId: attempt.resourceRevisionId,
        purchaseCommitment: attempt.purchaseCommitment,
      })),
    });
  });

  server.get("/v1/purchases/:attemptId", guard, async (request, reply) => {
    const { attemptId } = request.params as Readonly<{ attemptId: string }>;
    const session = sessionOf(request);
    const aggregate = isAttemptId(attemptId)
      ? await deps.purchaseReads.aggregateByAttemptId(attemptId)
      : null;
    if (aggregate === null || aggregate.ownerId !== session.ownerId) {
      // Existence-hiding: an attempt owned by someone else and an attempt
      // that never existed answer identically.
      return reply.status(404).send({
        error: "attempt-unknown",
        detail:
          "No purchase attempt with this ID belongs to your owner session.",
      });
    }
    const [lifecycle, events, settlement, delivery] = await Promise.all([
      deps.lifecycle.readHumanPurchaseLifecycle(
        attemptId as `sha256:${string}`,
      ),
      deps.purchaseReads.eventsSince(attemptId, 0),
      deps.purchaseReads.settlementFacts(attemptId),
      deps.purchaseReads.deliveryFacts(attemptId),
    ]);
    return reply.send({
      attempt: {
        attemptId: aggregate.attemptId,
        state: aggregate.state,
        createdAt: aggregate.createdAt,
        executeBefore: aggregate.executeBefore,
        commandId: aggregate.commandId,
        requestCommitment: aggregate.requestCommitment,
        challengeId: aggregate.challengeId,
        purchaseCommitment: aggregate.purchaseCommitment,
        preparedTransactionHash: aggregate.preparedTransactionHash,
        sourceCommit: aggregate.sourceCommit,
      },
      lifecycle,
      events,
      settlement,
      delivery,
    });
  });
}
