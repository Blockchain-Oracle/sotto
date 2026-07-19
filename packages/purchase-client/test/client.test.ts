import { describe, expect, it } from "vitest";
import { createSottoClient } from "../src/client.js";
import { pairedOutcome, TERMINAL_ATTEMPT_STATES } from "../src/journal.js";

type Call = Readonly<{ url: string; method: string; body?: string }>;

function fakeApi(
  routes: Readonly<Record<string, Readonly<{ status: number; body: unknown }>>>,
): {
  calls: Call[];
  fetch: (
    url: string,
    init: { method: string; body?: string },
  ) => Promise<Response>;
} {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({
        url,
        method: init.method,
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      const key = `${init.method} ${new URL(url).pathname}`;
      const route = routes[key];
      if (route === undefined) {
        return new Response(JSON.stringify({ error: "attempt-unknown" }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify(route.body), { status: route.status });
    },
  };
}

describe("createSottoClient", () => {
  it("initiates a purchase with exactly the listingId body", async () => {
    const api = fakeApi({
      "POST /v1/purchases": {
        status: 201,
        body: { attemptId: `sha256:${"b".repeat(64)}`, outcome: "created" },
      },
    });
    const client = createSottoClient({
      origin: "http://127.0.0.1:1",
      token: () => "cd".repeat(32),
      fetch: api.fetch,
    });
    const initiated = await client.purchases.initiate("listing-1");
    expect(initiated.outcome).toBe("created");
    expect(api.calls[0]?.body).toBe(JSON.stringify({ listingId: "listing-1" }));
  });

  it("reports an invalid session as false, not as a thrown error", async () => {
    const api = fakeApi({
      "GET /v1/purchases": {
        status: 401,
        body: { error: "session-required", detail: "absent" },
      },
    });
    const client = createSottoClient({
      origin: "http://127.0.0.1:1",
      fetch: api.fetch,
    });
    expect(await client.session.verify()).toBe(false);
  });

  it("reads catalog, evidence, and stats through their envelope fields", async () => {
    const api = fakeApi({
      "GET /v1/resources": { status: 200, body: { resources: [] } },
      "GET /v1/attempts": { status: 200, body: { attempts: [] } },
      "GET /v1/stats": {
        status: 200,
        body: {
          window: "7d",
          attempts: {},
          probes: {},
          railHealth: {},
          sourceCommit: "c",
        },
      },
    });
    const client = createSottoClient({
      origin: "http://127.0.0.1:1",
      fetch: api.fetch,
    });
    expect(await client.catalog.listResources()).toEqual([]);
    expect(await client.attempts.listPublic()).toEqual([]);
    expect((await client.stats.read()).window).toBe("7d");
  });
});

describe("journal vocabulary", () => {
  it("keeps settlement and delivery as separate paired facts", () => {
    expect(pairedOutcome("settlement-reconciled", null)).toMatchObject({
      settled: true,
      delivered: false,
      deliveryPending: true,
    });
    expect(pairedOutcome("settlement-reconciled", "delivered")).toMatchObject({
      settled: true,
      delivered: true,
      deliveryPending: false,
    });
    expect(
      pairedOutcome("settlement-reconciled", "delivery-unknown"),
    ).toMatchObject({ settled: true, deliveryFailed: true });
    expect(pairedOutcome("settlement-rejected", null)).toMatchObject({
      settled: false,
      settlementRejected: true,
    });
  });

  it("matches the API's SSE terminal set exactly", () => {
    expect([...TERMINAL_ATTEMPT_STATES].sort()).toEqual(
      [
        "wallet-rejected",
        "wallet-unsupported",
        "settlement-reconciled",
        "settlement-rejected",
      ].sort(),
    );
  });
});
