"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import type { CatalogResource, PublicAttempt, StatsResponse } from "./types";

/**
 * Small client data hook: one credentialed request, honest tri-state
 * (loading / data / error), manual reload. No cache invents data — a
 * failure keeps the error until a reload succeeds.
 */
export type ApiState<T> = Readonly<{
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}>;

export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(path !== null);
  const generation = useRef(0);

  const run = useCallback(() => {
    if (path === null) return;
    const ticket = ++generation.current;
    setLoading(true);
    setError(null);
    apiRequest<T>(path)
      .then((payload) => {
        if (generation.current !== ticket) return;
        setData(payload);
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (generation.current !== ticket) return;
        setError(failure);
        setLoading(false);
      });
  }, [path]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, reload: run };
}

export function useCatalog(): ApiState<readonly CatalogResource[]> {
  const state = useApi<{ resources: readonly CatalogResource[] }>(
    "/v1/resources",
  );
  return {
    data: state.data?.resources ?? null,
    error: state.error,
    loading: state.loading,
    reload: state.reload,
  };
}

export function useAttempts(limit = 50): ApiState<readonly PublicAttempt[]> {
  const state = useApi<{ attempts: readonly PublicAttempt[] }>(
    `/v1/attempts?limit=${limit}`,
  );
  return {
    data: state.data?.attempts ?? null,
    error: state.error,
    loading: state.loading,
    reload: state.reload,
  };
}

export function useStats(window: string): ApiState<StatsResponse> {
  return useApi<StatsResponse>(`/v1/stats?window=${window}`);
}
