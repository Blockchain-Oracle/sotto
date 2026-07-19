import { afterAll, beforeAll, expect, it } from "vitest";
import {
  HARNESS_PARTY,
  HARNESS_WALLET_ID,
  startApiPostgresHarness,
  type ApiPostgresHarness,
} from "./api-postgres.fixture.js";

let harness: ApiPostgresHarness;
let sessionCookie: { name: string; value: string };
let attemptId: string;

beforeAll(async () => {
  harness = await startApiPostgresHarness("sotto_api_boot_test");
});

afterAll(async () => harness?.close());

it("onboards a hosted owner and rides the signed session cookie", async () => {
  const response = await harness.server.inject({
    method: "POST",
    url: "/v1/onboarding/hosted",
    payload: { ownerHint: "Postgres Judge" },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({
    partyId: HARNESS_PARTY,
    walletId: HARNESS_WALLET_ID,
    walletUrl: "http://127.0.0.1:1/link/test",
  });
  const cookie = response.cookies.find((c) => c.name === "sotto_session");
  expect(cookie).toBeDefined();
  sessionCookie = { name: cookie!.name, value: cookie!.value };

  const owners = await harness.pool.query(
    `SELECT party_id FROM sotto.owners WHERE party_id = $1`,
    [HARNESS_PARTY],
  );
  expect(owners.rowCount).toBe(1);
  const sessions = await harness.pool.query<{ tokenHash: string }>(
    `SELECT token_hash AS "tokenHash" FROM sotto.sessions`,
  );
  expect(sessions.rows).toHaveLength(1);
  // Only the hash is stored; the opaque token never appears in the row.
  expect(sessionCookie.value).not.toContain(sessions.rows[0]!.tokenHash);

  const guarded = await harness.server.inject({
    method: "GET",
    url: "/v1/purchases",
    cookies: { [sessionCookie.name]: sessionCookie.value },
  });
  expect(guarded.statusCode).toBe(200);
  expect(guarded.json()).toEqual({ attempts: [] });
});

it("initiates a purchase writing a real intent-created journal row", async () => {
  const response = await harness.server.inject({
    method: "POST",
    url: "/v1/purchases",
    payload: { listingId: harness.listingId },
    cookies: { [sessionCookie.name]: sessionCookie.value },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  expect(body).toMatchObject({
    outcome: "created",
    state: "intent-created",
    price: { changed: false },
  });
  attemptId = body.attemptId as string;
  const events = await harness.pool.query<{ type: string; sequence: string }>(
    `SELECT event_type AS "type", sequence::text AS "sequence"
     FROM sotto.attempt_events WHERE attempt_id = $1`,
    [attemptId],
  );
  expect(events.rows).toEqual([{ type: "intent-created", sequence: "1" }]);
});

it("streams exactly the committed journal events over SSE", async () => {
  const address = harness.server.server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("server address unavailable");
  }
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/purchases/${attemptId}/events`,
    {
      headers: {
        cookie: `sotto_session=${encodeURIComponent(sessionCookie.value)}`,
      },
      signal: controller.signal,
    },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  const reader = response.body!.getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += Buffer.from(value).toString("utf8");
    if (buffer.includes("event: intent-created")) break;
  }
  controller.abort();
  expect(buffer).toContain("id: 1\nevent: intent-created\n");
  const dataLine = buffer.split("\n").find((line) => line.startsWith("data: "));
  expect(JSON.parse(dataLine!.slice("data: ".length))).toMatchObject({
    sequence: 1,
    type: "intent-created",
  });
  // Only the committed row streams: no later sequence exists yet.
  expect(buffer).not.toContain("id: 2\n");
});

it("projects the attempt publicly redacted and fully for the owner", async () => {
  const publicView = await harness.server.inject({
    method: "GET",
    url: `/v1/attempts/${attemptId}`,
  });
  expect(publicView.statusCode).toBe(200);
  const publicAttempt = publicView.json().attempt;
  expect(publicAttempt.receipt).toBeNull();
  expect(publicAttempt.redactions.length).toBeGreaterThan(0);
  expect(publicAttempt.settlement.status).toBe("not-submitted");
  expect(publicAttempt.delivery.status).toBe("not-started");

  const ownerView = await harness.server.inject({
    method: "GET",
    url: `/v1/attempts/${attemptId}`,
    cookies: { [sessionCookie.name]: sessionCookie.value },
  });
  const ownerAttempt = ownerView.json().attempt;
  expect(ownerAttempt.receipt).toMatchObject({
    commandId: expect.stringMatching(/^sotto-human-purchase-v1-/u),
  });
  expect(ownerAttempt.redactions).toHaveLength(0);

  const feed = await harness.server.inject({
    method: "GET",
    url: "/v1/attempts",
  });
  expect(
    feed.json().attempts.map((a: { attemptId: string }) => a.attemptId),
  ).toContain(attemptId);

  const missing = await harness.server.inject({
    method: "GET",
    url: `/v1/attempts/sha256:${"0".repeat(64)}`,
  });
  expect(missing.statusCode).toBe(404);
});

it("reports real statistics with honest rate availability", async () => {
  const response = await harness.server.inject({
    method: "GET",
    url: "/v1/stats?window=all",
  });
  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.attempts.total).toBeGreaterThanOrEqual(1);
  // No attempt has executed: settlement rate is unavailable, not zero.
  expect(body.attempts.executed).toBe(0);
  expect(body.attempts.settlementRate).toBeNull();
  expect(body.railHealth.database).toBe("reachable");
  expect(body.railHealth.worker.state).toBe("never-seen");
});
