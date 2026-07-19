import type { FastifyInstance } from "fastify";
import type { ApiDependencies } from "../dependencies.js";

const WINDOWS: Readonly<Record<string, number | null>> = Object.freeze({
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
  all: null,
});

function rate(numerator: number, denominator: number): number | null {
  // A rate over zero events is unavailable, not zero: `null` here means
  // "no denominator in this window", while a real 0 means observed failures.
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Real aggregates only. Settlement rate and delivery rate are always
 * separate; every `null` marks an unavailable measure (empty window or an
 * unreachable dependency), never a disguised zero — and every zero is a
 * genuine count from persisted rows.
 */
export function registerStatsRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  server.get("/v1/stats", async (request, reply) => {
    const rawWindow = (request.query as Record<string, unknown>).window;
    const windowKey =
      typeof rawWindow === "string" && rawWindow in WINDOWS ? rawWindow : "7d";
    const windowMs = WINDOWS[windowKey] ?? null;
    const since =
      windowMs === null ? null : new Date(Date.now() - windowMs).toISOString();

    const databaseUp = await deps.stats.ping();
    if (!databaseUp) {
      return reply.status(503).send({
        error: "database-unavailable",
        detail:
          "The statistics store is unreachable, so no aggregate can be " +
          "reported. Restore the database connection and reload.",
      });
    }
    const [attempts, probes, heartbeat] = await Promise.all([
      deps.stats.attemptCounts(since),
      deps.stats.probeCounts(since),
      deps.stats.latestWorkerHeartbeat(),
    ]);
    const heartbeatAgeMs =
      heartbeat === null ? null : Date.now() - Date.parse(heartbeat.beatAt);
    return reply.send({
      window: windowKey,
      attempts: {
        total: attempts.attempts,
        executed: attempts.executed,
        settled: attempts.settled,
        settlementRejected: attempts.settlementRejected,
        delivered: attempts.delivered,
        deliveryFailed: attempts.deliveryFailed,
        settlementRate: rate(attempts.settled, attempts.executed),
        deliveryRate: rate(attempts.delivered, attempts.settled),
      },
      probes: {
        observations: probes.observations,
        healthy: probes.healthy,
        degraded: probes.degraded,
        failing: probes.failing,
        healthyRate: rate(probes.healthy, probes.observations),
      },
      railHealth: {
        database: "reachable",
        worker:
          heartbeat === null
            ? { state: "never-seen", heartbeatAgeMilliseconds: null }
            : {
                state: "seen",
                workerId: heartbeat.workerId,
                sourceCommit: heartbeat.sourceCommit,
                beatAt: heartbeat.beatAt,
                heartbeatAgeMilliseconds: heartbeatAgeMs,
              },
        fiveNorthConfigured: deps.fiveNorthConfigured,
      },
      sourceCommit: deps.sourceCommit,
    });
  });
}
