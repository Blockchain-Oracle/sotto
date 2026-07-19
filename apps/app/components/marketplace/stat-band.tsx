"use client";

import type { CatalogResource, StatsResponse } from "../../lib/types";

function ratio(value: number | null): string {
  // `null` from the API means "no denominator in this window" — shown as
  // an em dash, never a disguised zero.
  if (value === null) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

/**
 * Real-stat band. `—` marks unavailable measures; a rendered 0 is a real
 * count from persisted rows.
 */
export function StatBand({
  resources,
  stats,
  statsFailed,
}: {
  resources: readonly CatalogResource[] | null;
  stats: StatsResponse | null;
  statsFailed: boolean;
}) {
  const providerCount =
    resources === null
      ? null
      : new Set(resources.map((resource) => resource.providerId)).size;
  const cells = [
    {
      label: "Verified resources",
      value: resources === null ? "—" : String(resources.length),
    },
    {
      label: "Live providers",
      value: providerCount === null ? "—" : String(providerCount),
    },
    {
      label: `Settled calls (${stats?.window ?? "7d"})`,
      value: stats === null ? "—" : String(stats.attempts.settled),
    },
    {
      label: `Delivery rate (${stats?.window ?? "7d"})`,
      value: stats === null ? "—" : ratio(stats.attempts.deliveryRate),
    },
  ];
  return (
    <div className="app-statband" role="group" aria-label="Marketplace totals">
      {cells.map((cell) => (
        <div className="app-stat" key={cell.label}>
          <span className="app-stat-label">{cell.label}</span>
          <span className="app-stat-value">{cell.value}</span>
        </div>
      ))}
      {statsFailed ? (
        <div className="app-stat">
          <span className="app-stat-label">Stats source</span>
          <span className="app-stat-value" style={{ fontSize: 13 }}>
            Unavailable
          </span>
        </div>
      ) : null}
    </div>
  );
}
