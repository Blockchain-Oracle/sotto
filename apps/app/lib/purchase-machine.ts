"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiOrigin, apiRequest } from "./api";
import type {
  AttemptEvent,
  PriceFacts,
  PurchaseCreated,
  PurchaseDetail,
} from "./types";

export const TERMINAL_EVENTS: ReadonlySet<string> = new Set([
  "wallet-rejected",
  "wallet-unsupported",
  "settlement-reconciled",
  "settlement-rejected",
]);

export type PurchaseRun = Readonly<{
  phase:
    | "idle"
    | "initiating"
    | "price-conflict"
    | "failed"
    | "streaming"
    | "terminal";
  created: PurchaseCreated | null;
  events: readonly AttemptEvent[];
  priceConflict: PriceFacts | null;
  failure: Readonly<{ code: string; detail: string; status: number }> | null;
  detail: PurchaseDetail | null;
  sessionLost: boolean;
}>;

const IDLE: PurchaseRun = Object.freeze({
  phase: "idle",
  created: null,
  events: Object.freeze([]),
  priceConflict: null,
  failure: null,
  detail: null,
  sessionLost: false,
});

/**
 * Purchase lifecycle driver (04a). Initiation is one POST that observes
 * the live 402; every later transition arrives over SSE as an
 * already-committed journal row (`id:` = sequence, so the browser's
 * automatic `Last-Event-ID` resume continues from the exact row after a
 * drop). After a terminal settlement event, delivery facts are polled
 * from the owner read — the journal ends at settlement.
 */
export function usePurchaseRun(): Readonly<{
  run: PurchaseRun;
  prepare: (listingId: string) => Promise<void>;
  reset: () => void;
}> {
  const [run, setRun] = useState<PurchaseRun>(IDLE);
  const sourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const pollDelivery = useCallback((attemptId: string) => {
    const poll = async () => {
      try {
        const detail = await apiRequest<PurchaseDetail>(
          `/v1/purchases/${encodeURIComponent(attemptId)}`,
        );
        setRun((previous) => ({ ...previous, detail }));
        const settled = detail.attempt.state === "settlement-reconciled";
        const deliveryDone =
          detail.delivery !== null &&
          (detail.delivery.respondedAt !== null ||
            detail.delivery.failureCode !== null);
        if ((!settled || deliveryDone) && pollRef.current !== null) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Keep polling; the surface stays on its last honest state.
      }
    };
    void poll();
    pollRef.current = setInterval(() => void poll(), 3000);
  }, []);

  const stream = useCallback(
    (attemptId: string) => {
      const source = new EventSource(
        `${apiOrigin()}/v1/purchases/${encodeURIComponent(attemptId)}/events`,
        { withCredentials: true },
      );
      sourceRef.current = source;
      const onEvent = (message: MessageEvent<string>) => {
        let event: AttemptEvent;
        try {
          event = JSON.parse(message.data) as AttemptEvent;
        } catch {
          return;
        }
        setRun((previous) => {
          if (previous.events.some((e) => e.sequence === event.sequence)) {
            return previous;
          }
          const events = [...previous.events, event].sort(
            (a, b) => a.sequence - b.sequence,
          );
          const terminal = TERMINAL_EVENTS.has(event.type);
          return {
            ...previous,
            events,
            phase: terminal ? "terminal" : previous.phase,
          };
        });
        if (TERMINAL_EVENTS.has(event.type)) {
          source.close();
          sourceRef.current = null;
          pollDelivery(attemptId);
        }
      };
      for (const type of [
        "intent-created",
        "prepared-hash-verified",
        "approval-requested",
        "wallet-rejected",
        "wallet-unsupported",
        "signature-verified",
        "execution-started",
        "settlement-reconciled",
        "settlement-rejected",
      ]) {
        source.addEventListener(type, onEvent as EventListener);
      }
      // The stream reconnects automatically with Last-Event-ID; a fatal
      // failure falls back to the owner read poll so state stays real.
      source.onerror = () => undefined;
    },
    [pollDelivery],
  );

  const prepare = useCallback(
    async (listingId: string) => {
      stop();
      setRun({ ...IDLE, phase: "initiating" });
      try {
        const created = await apiRequest<PurchaseCreated>("/v1/purchases", {
          method: "POST",
          body: { listingId },
        });
        setRun((previous) => ({
          ...previous,
          phase: "streaming",
          created,
        }));
        stream(created.attemptId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const price = error.body.price as PriceFacts | undefined;
          setRun({
            ...IDLE,
            phase: "price-conflict",
            priceConflict: price ?? null,
            failure: {
              code: error.code,
              detail: error.detail,
              status: error.status,
            },
          });
          return;
        }
        const failure =
          error instanceof ApiError
            ? { code: error.code, detail: error.detail, status: error.status }
            : {
                code: "api-unreachable",
                detail: "The Sotto API did not answer the purchase initiation.",
                status: 0,
              };
        setRun({
          ...IDLE,
          phase: "failed",
          failure,
          sessionLost: error instanceof ApiError ? error.status === 401 : false,
        });
      }
    },
    [stop, stream],
  );

  const reset = useCallback(() => {
    stop();
    setRun(IDLE);
  }, [stop]);

  return { run, prepare, reset };
}
