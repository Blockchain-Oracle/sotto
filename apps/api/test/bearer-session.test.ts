import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import {
  fakeDependencies,
  memorySessionRepository,
  TEST_PARTY,
} from "./fakes.js";

let server: FastifyInstance | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("bearer-token session carrier", () => {
  it("accepts the same opaque session token via Authorization: Bearer", async () => {
    const sessions = memorySessionRepository();
    server = await buildServer(fakeDependencies({ sessions }));
    const { token } = await sessions.createSession({ partyId: TEST_PARTY });

    const guarded = await server.inject({
      method: "GET",
      url: "/v1/purchases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(guarded.statusCode).toBe(200);
    expect(guarded.json()).toEqual({ attempts: [] });
  });

  it("rejects malformed and unknown bearer tokens with session-required", async () => {
    server = await buildServer(fakeDependencies());
    for (const header of [
      "Bearer not-a-token",
      `Bearer ${"f".repeat(64)}`,
      "Basic abcdef",
    ]) {
      const response = await server.inject({
        method: "GET",
        url: "/v1/purchases",
        headers: { authorization: header },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: "session-required" });
    }
  });

  it("revokes a bearer-presented session on DELETE /v1/session", async () => {
    const sessions = memorySessionRepository();
    server = await buildServer(fakeDependencies({ sessions }));
    const { token } = await sessions.createSession({ partyId: TEST_PARTY });

    const revoked = await server.inject({
      method: "DELETE",
      url: "/v1/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoked.statusCode).toBe(204);

    const afterRevoke = await server.inject({
      method: "GET",
      url: "/v1/purchases",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });
});
