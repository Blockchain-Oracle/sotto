import { describe, expect, it } from "vitest";
import { createTransport } from "../src/http.js";
import { createSseParser, followPurchaseEvents } from "../src/sse.js";

const ATTEMPT = `sha256:${"a".repeat(64)}`;

function frame(sequence: number, type: string): string {
  const data = JSON.stringify({
    sequence,
    type,
    recordedAt: `2026-07-19T00:00:0${sequence}.000Z`,
    updateId: type === "settlement-reconciled" ? "1220update" : null,
  });
  return `id: ${sequence}\nevent: ${type}\ndata: ${data}\n\n`;
}

describe("SSE parser", () => {
  it("collects frames across chunk boundaries and skips heartbeats", () => {
    const parser = createSseParser();
    const whole = `: stream-open\n\n${frame(1, "intent-created")}`;
    const first = parser.feed(whole.slice(0, 20));
    const second = parser.feed(whole.slice(20));
    const events = [...first, ...second];
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("intent-created");
    expect(JSON.parse(events[0]?.data ?? "")).toMatchObject({ sequence: 1 });
  });
});

describe("followPurchaseEvents", () => {
  it("yields journal events until the terminal state, then stops", async () => {
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async () =>
        new Response(
          frame(1, "intent-created") +
            frame(2, "prepared-hash-verified") +
            frame(3, "approval-requested") +
            frame(6, "settlement-reconciled") +
            frame(7, "never-delivered-because-terminal"),
          { status: 200 },
        ),
    });
    const seen: string[] = [];
    for await (const event of followPurchaseEvents(transport, ATTEMPT)) {
      seen.push(`${event.sequence}:${event.type}`);
    }
    expect(seen).toEqual([
      "1:intent-created",
      "2:prepared-hash-verified",
      "3:approval-requested",
      "6:settlement-reconciled",
    ]);
  });

  it("reconnects with Last-Event-ID and never repeats a sequence", async () => {
    const cursors: Array<string | undefined> = [];
    let call = 0;
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async (_url, init) => {
        cursors.push(init.headers["last-event-id"]);
        call += 1;
        if (call === 1) {
          return new Response(
            frame(1, "intent-created") + frame(2, "prepared-hash-verified"),
            { status: 200 },
          );
        }
        return new Response(
          frame(2, "prepared-hash-verified") + frame(4, "wallet-rejected"),
          { status: 200 },
        );
      },
    });
    const seen: number[] = [];
    for await (const event of followPurchaseEvents(transport, ATTEMPT, {
      reconnectDelayMs: 1,
    })) {
      seen.push(event.sequence);
    }
    expect(seen).toEqual([1, 2, 4]);
    expect(cursors).toEqual([undefined, "2"]);
  });

  it("surfaces the API's 404 error code instead of inventing events", async () => {
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: "attempt-unknown", detail: "none" }),
          { status: 404 },
        ),
    });
    const iterator = followPurchaseEvents(transport, ATTEMPT);
    await expect(iterator.next()).rejects.toMatchObject({
      code: "attempt-unknown",
    });
  });

  it("stops silently when the caller aborts", async () => {
    const controller = new AbortController();
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async () =>
        new Response(frame(1, "intent-created"), { status: 200 }),
    });
    const seen: number[] = [];
    for await (const event of followPurchaseEvents(transport, ATTEMPT, {
      signal: controller.signal,
      reconnectDelayMs: 1,
    })) {
      seen.push(event.sequence);
      controller.abort();
    }
    expect(seen).toEqual([1]);
  });
});
