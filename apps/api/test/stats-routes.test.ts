import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { fakeDependencies } from "./fakes.js";

let server: FastifyInstance | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("statistics", () => {
  it("reports known zeros as counts and empty windows as null rates", async () => {
    server = await buildServer(fakeDependencies());
    const response = await server.inject({ method: "GET", url: "/v1/stats" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.attempts).toMatchObject({
      total: 0,
      settled: 0,
      settlementRate: null,
      deliveryRate: null,
    });
    expect(body.probes.healthyRate).toBeNull();
    expect(body.railHealth.worker).toEqual({
      state: "never-seen",
      heartbeatAgeMilliseconds: null,
    });
    expect(body.railHealth.fiveNorthConfigured).toBe(false);
  });

  it("keeps settlement and delivery rates separate real fractions", async () => {
    server = await buildServer(
      fakeDependencies({
        stats: {
          attemptCounts: async () => ({
            attempts: 10,
            executed: 8,
            settled: 6,
            settlementRejected: 2,
            delivered: 3,
            deliveryFailed: 1,
          }),
          probeCounts: async () => ({
            observations: 4,
            healthy: 4,
            degraded: 0,
            failing: 0,
          }),
          latestWorkerHeartbeat: async () => ({
            workerId: "worker-1",
            kind: "sotto-worker",
            sourceCommit: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
            beatAt: new Date(Date.now() - 5_000).toISOString(),
          }),
          ping: async () => true,
        },
      }),
    );
    const response = await server.inject({
      method: "GET",
      url: "/v1/stats?window=24h",
    });
    const body = response.json();
    expect(body.attempts.settlementRate).toBeCloseTo(0.75);
    expect(body.attempts.deliveryRate).toBeCloseTo(0.5);
    expect(body.railHealth.worker.state).toBe("seen");
    expect(
      body.railHealth.worker.heartbeatAgeMilliseconds,
    ).toBeGreaterThanOrEqual(0);
  });

  it("answers 503 when the statistics store is unreachable", async () => {
    server = await buildServer(
      fakeDependencies({
        stats: {
          attemptCounts: async () => {
            throw new Error("unreachable");
          },
          probeCounts: async () => {
            throw new Error("unreachable");
          },
          latestWorkerHeartbeat: async () => null,
          ping: async () => false,
        },
      }),
    );
    const response = await server.inject({ method: "GET", url: "/v1/stats" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "database-unavailable" });
  });
});
