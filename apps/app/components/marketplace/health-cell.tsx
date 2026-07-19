"use client";

import { formatRelative } from "../ui";
import { healthLabel, healthTone } from "../../lib/present";
import type { ResourceHealth } from "../../lib/types";

/**
 * Health + last-probe cell. `undefined` = still loading (—), `null` = the
 * API reports no observation yet (Not probed). Status is label + shape,
 * never color alone.
 */
export function HealthCell({
  health,
  now,
}: {
  health: ResourceHealth | null | undefined;
  now: Date;
}) {
  if (health === undefined) {
    return <span className="app-health-when">—</span>;
  }
  if (health === null) {
    return (
      <span className="app-health" data-tone="neutral">
        <span className="app-health-dot" aria-hidden="true" />
        Not probed
      </span>
    );
  }
  return (
    <span className="app-health" data-tone={healthTone(health.status)}>
      <span className="app-health-dot" aria-hidden="true" />
      {healthLabel(health.status)}
      <span className="app-health-when">
        {formatRelative(new Date(health.observedAt), now)}
      </span>
    </span>
  );
}
