"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import type { AttemptEvidence } from "./types";

const CONCURRENCY = 6;

export type EvidenceMap = ReadonlyMap<string, AttemptEvidence>;

/**
 * Public evidence per attempt (delivery status lives only on the detail
 * projection, never on the feed row). Bounded concurrency; an attempt
 * absent from the map is still loading or failed — rendered as `—`.
 */
export function useEvidenceMap(attemptIds: readonly string[]): EvidenceMap {
  const [map, setMap] = useState<Map<string, AttemptEvidence>>(() => new Map());
  const key = attemptIds.join(",");

  useEffect(() => {
    if (key === "") return;
    let cancelled = false;
    const queue = key.split(",");
    const worker = async () => {
      for (;;) {
        const attemptId = queue.shift();
        if (attemptId === undefined || cancelled) return;
        try {
          const { attempt } = await apiRequest<{ attempt: AttemptEvidence }>(
            `/v1/attempts/${attemptId}`,
          );
          if (!cancelled) {
            setMap((previous) => {
              const next = new Map(previous);
              next.set(attemptId, attempt);
              return next;
            });
          }
        } catch {
          // Leave the row honest-unknown.
        }
      }
    };
    for (let i = 0; i < CONCURRENCY; i += 1) void worker();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return map;
}
