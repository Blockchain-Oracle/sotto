import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { fakeDependencies, publishedResource } from "./fakes.js";

let server: FastifyInstance | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("public catalog routes", () => {
  it("answers an honest empty catalog without a session", async () => {
    server = await buildServer(fakeDependencies());
    const response = await server.inject({
      method: "GET",
      url: "/v1/resources",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ resources: [] });
  });

  it("serves a populated catalog and per-listing detail", async () => {
    const resource = publishedResource();
    server = await buildServer(
      fakeDependencies({
        catalog: {
          listResources: async () => Object.freeze([resource]),
          resourceByListing: async (listingId) =>
            listingId === "018f3f24-7d4a-7e2c-a421-0f3473b96010"
              ? resource
              : null,
          latestHealth: async () => null,
        },
      }),
    );
    const list = await server.inject({ method: "GET", url: "/v1/resources" });
    expect(list.json().resources).toHaveLength(1);
    const detail = await server.inject({
      method: "GET",
      url: "/v1/resources/018f3f24-7d4a-7e2c-a421-0f3473b96010",
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().resource).toMatchObject({
      name: "Current weather",
      amountAtomic: "2500000000",
    });
    const health = await server.inject({
      method: "GET",
      url: "/v1/resources/018f3f24-7d4a-7e2c-a421-0f3473b96010/health",
    });
    expect(health.statusCode).toBe(200);
    // No observations yet: health is null, not a fabricated "healthy".
    expect(health.json()).toMatchObject({ health: null });
  });

  it("404s an unknown listing with the next safe action", async () => {
    server = await buildServer(fakeDependencies());
    const response = await server.inject({
      method: "GET",
      url: "/v1/resources/018f3f24-7d4a-7e2c-a421-0f3473b96099",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "resource-unknown" });
  });
});
