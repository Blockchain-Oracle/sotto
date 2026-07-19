import { setTimeout as delay } from "node:timers/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ApiDependencies } from "../dependencies.js";
import { requireSession, sessionOf } from "../auth/session.js";
import { isAttemptId } from "../services/purchase-reads.js";

const DEFAULT_POLL_MS = 1_000;
const TERMINAL_STATES = new Set([
  "wallet-rejected",
  "wallet-unsupported",
  "settlement-reconciled",
  "settlement-rejected",
]);

function resumeCursor(request: FastifyRequest): number {
  const header = request.headers["last-event-id"];
  const query = (request.query as Record<string, unknown>).lastEventId;
  const raw = typeof header === "string" ? header : query;
  if (typeof raw !== "string" || !/^[0-9]{1,6}$/u.test(raw)) return 0;
  return Number(raw);
}

/**
 * Live purchase lifecycle stream. Every SSE event is one already-committed
 * `sotto.attempt_events` row — the stream polls the journal each second
 * and forwards only newly appended rows, so nothing arrives before the
 * database made it durable. `Last-Event-ID` resumes from the exact
 * sequence; idle polls emit heartbeat comments; the poll loop dies with
 * the connection.
 */
export function registerPurchaseEventRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  const pollMs = deps.eventPollMilliseconds ?? DEFAULT_POLL_MS;

  server.get(
    "/v1/purchases/:attemptId/events",
    { preHandler: requireSession(deps.sessions) },
    async (request, reply) => {
      const { attemptId } = request.params as Readonly<{ attemptId: string }>;
      const session = sessionOf(request);
      const aggregate = isAttemptId(attemptId)
        ? await deps.purchaseReads.aggregateByAttemptId(attemptId)
        : null;
      if (aggregate === null || aggregate.ownerId !== session.ownerId) {
        return reply.status(404).send({
          error: "attempt-unknown",
          detail:
            "No purchase attempt with this ID belongs to your owner session.",
        });
      }
      reply.raw.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
        "x-accel-buffering": "no",
      });
      reply.raw.write(": stream-open\n\n");
      const controller = new AbortController();
      request.raw.on("close", () => controller.abort());
      let cursor = resumeCursor(request);
      try {
        while (!controller.signal.aborted) {
          const events = await deps.purchaseReads.eventsSince(
            attemptId,
            cursor,
          );
          if (controller.signal.aborted) break;
          if (events.length === 0) {
            reply.raw.write(`: heartbeat ${new Date().toISOString()}\n\n`);
          }
          let terminal = false;
          for (const event of events) {
            cursor = event.sequence;
            reply.raw.write(
              `id: ${event.sequence}\n` +
                `event: ${event.type}\n` +
                `data: ${JSON.stringify(event)}\n\n`,
            );
            if (TERMINAL_STATES.has(event.type)) terminal = true;
          }
          if (terminal) break;
          await delay(pollMs, undefined, { signal: controller.signal }).catch(
            () => undefined,
          );
        }
      } finally {
        reply.raw.end();
      }
      return reply;
    },
  );
}
