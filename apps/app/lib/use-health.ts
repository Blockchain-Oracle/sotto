"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import type { ResourceHealth } from "./types";

const CONCURRENCY = 6;

export type HealthMap = ReadonlyMap<string, ResourceHealth | null>;

/**
 * Latest health per listing, fetched from the real per-resource health
 * endpoint with bounded concurrency. `null` means the API answered "no
 * observation yet" — rendered as Not probed, never as Healthy. A listing
 * absent from the map is still loading.
 */
export function useHealthMap(listingIds: readonly string[]): HealthMap {
  const [map, setMap] = useState<Map<string, ResourceHealth | null>>(
    () => new Map(),
  );
  const key = listingIds.join(",");

  useEffect(() => {
    if (key === "") return;
    let cancelled = false;
    const queue = key.split(",");
    const worker = async () => {
      for (;;) {
        const listingId = queue.shift();
        if (listingId === undefined || cancelled) return;
        try {
          const { health } = await apiRequest<{
            resourceId: string;
            health: ResourceHealth | null;
          }>(`/v1/resources/${listingId}/health`);
          if (!cancelled) {
            setMap((previous) => {
              const next = new Map(previous);
              next.set(listingId, health);
              return next;
            });
          }
        } catch {
          // Leave the row honest-unknown; the row renders "—" for health.
          if (!cancelled) {
            setMap((previous) => {
              const next = new Map(previous);
              next.set(listingId, null);
              return next;
            });
          }
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
