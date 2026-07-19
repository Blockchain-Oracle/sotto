"use client";

import { useEffect, useState } from "react";

import { SystemStrip } from "../ui";
import { apiRequest } from "../../lib/api";
import type { StatsResponse } from "../../lib/types";

/** Worker heartbeat older than this is a material system condition. */
const WORKER_STALE_MS = 5 * 60 * 1000;

type Condition = Readonly<{
  tone: "ambra" | "rosso";
  text: string;
}>;

function conditionOf(
  stats: StatsResponse | null,
  failed: boolean,
): Condition | null {
  if (failed) {
    return {
      tone: "rosso",
      text: "The Sotto API is unreachable — nothing on this page can update until it answers.",
    };
  }
  if (stats === null) return null;
  const { worker, fiveNorthConfigured } = stats.railHealth;
  if (worker.state === "never-seen") {
    return {
      tone: "ambra",
      text: "No purchase worker has ever reported a heartbeat — settlements will not progress.",
    };
  }
  if (
    worker.heartbeatAgeMilliseconds !== null &&
    worker.heartbeatAgeMilliseconds > WORKER_STALE_MS
  ) {
    const minutes = Math.floor(worker.heartbeatAgeMilliseconds / 60000);
    return {
      tone: "ambra",
      text: `Purchase worker heartbeat is ${minutes}m old — settlement progress is delayed.`,
    };
  }
  if (!fiveNorthConfigured) {
    return {
      tone: "ambra",
      text: "Canton DevNet (Five North) is not configured on this deployment — purchases cannot settle.",
    };
  }
  return null;
}

/**
 * Global system strip: material system conditions only, driven by the
 * real /v1/stats rail-health block. Hidden entirely when healthy.
 */
export function RailStrip() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<StatsResponse>("/v1/stats?window=24h")
      .then((payload) => {
        if (!cancelled) setStats(payload);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const condition = conditionOf(stats, failed);
  if (condition === null) return null;
  return <SystemStrip tone={condition.tone}>{condition.text}</SystemStrip>;
}
