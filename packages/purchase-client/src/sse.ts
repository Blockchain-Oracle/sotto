import { SottoApiError, SottoResponseShapeError } from "./errors.js";
import type { Transport } from "./http.js";
import { readBounded } from "./http.js";
import { isTerminalAttemptState } from "./journal.js";
import type { AttemptEvent } from "./types.js";

const MAX_EVENT_BYTES = 64 * 1024;

export type FollowOptions = Readonly<{
  lastEventId?: number;
  signal?: AbortSignal;
  reconnectDelayMs?: number;
  maxReconnects?: number;
}>;

export type ParsedSseEvent = Readonly<{
  id: string | undefined;
  event: string | undefined;
  data: string;
}>;

/** Incremental SSE frame parser: feed chunks, collect complete events. */
export function createSseParser(): {
  feed(chunk: string): readonly ParsedSseEvent[];
} {
  let buffer = "";
  return {
    feed(chunk) {
      buffer += chunk.replaceAll("\r\n", "\n");
      if (buffer.length > MAX_EVENT_BYTES) {
        throw new SottoResponseShapeError("SSE frame exceeded 64KiB");
      }
      const events: ParsedSseEvent[] = [];
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary === -1) break;
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let id: string | undefined;
        let event: string | undefined;
        const data: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith(":")) continue; // heartbeat comment
          if (line.startsWith("id:")) id = line.slice(3).trim();
          else if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trim());
        }
        if (id !== undefined || event !== undefined || data.length > 0) {
          events.push(Object.freeze({ id, event, data: data.join("\n") }));
        }
      }
      return events;
    },
  };
}

function parseAttemptEvent(frame: ParsedSseEvent): AttemptEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    throw new SottoResponseShapeError("SSE data was not JSON");
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.sequence !== "number" ||
    typeof record.type !== "string" ||
    typeof record.recordedAt !== "string"
  ) {
    throw new SottoResponseShapeError("SSE event missed journal fields");
  }
  return Object.freeze({
    sequence: record.sequence,
    type: record.type,
    recordedAt: record.recordedAt,
    updateId: typeof record.updateId === "string" ? record.updateId : null,
  });
}

const delay = (ms: number, signal: AbortSignal | undefined) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

/**
 * Follows `/v1/purchases/:attemptId/events` as an async iterator of
 * journal events. Every yielded event is an already-committed
 * `sotto.attempt_events` row. A dropped connection reconnects with
 * `Last-Event-ID` so no sequence is missed or repeated; iteration ends at
 * the journal's terminal event or the caller's AbortSignal — never by
 * inventing an outcome.
 */
export async function* followPurchaseEvents(
  transport: Transport,
  attemptId: string,
  options: FollowOptions = {},
): AsyncGenerator<AttemptEvent, void, undefined> {
  let cursor = options.lastEventId ?? 0;
  const signal = options.signal;
  // aborted() defeats control-flow narrowing: the flag flips between awaits.
  const aborted = (): boolean => signal?.aborted === true;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
  let reconnectsLeft = options.maxReconnects ?? 30;
  for (;;) {
    if (aborted()) return;
    const response = await transport.fetchRaw(
      `/v1/purchases/${encodeURIComponent(attemptId)}/events`,
      {
        accept: "text/event-stream",
        ...(cursor > 0 ? { "last-event-id": String(cursor) } : {}),
      },
      signal,
    );
    if (!response.ok) {
      const text = await readBounded(response, MAX_EVENT_BYTES);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // non-JSON error body: the status alone names the failure
      }
      throw new SottoApiError(response.status, body, `http-${response.status}`);
    }
    if (response.body === null) {
      throw new SottoResponseShapeError("event stream had no body");
    }
    const parser = createSseParser();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const abort = () => void reader.cancel().catch(() => undefined);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of parser.feed(
          decoder.decode(value, { stream: true }),
        )) {
          if (frame.data === "") continue;
          const event = parseAttemptEvent(frame);
          if (event.sequence <= cursor) continue;
          cursor = event.sequence;
          yield event;
          if (isTerminalAttemptState(event.type)) return;
        }
      }
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    if (aborted()) return;
    if (reconnectsLeft <= 0) {
      throw new SottoResponseShapeError(
        "event stream ended before a terminal journal event and the " +
          "reconnect budget is exhausted",
      );
    }
    reconnectsLeft -= 1;
    await delay(reconnectDelayMs, signal);
  }
}
