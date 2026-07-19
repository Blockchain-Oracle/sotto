"use client";

import { useMemo, useState } from "react";

import { Button, Select, formatUtc } from "../ui";
import { describeFailure } from "../../lib/api";
import { deliveryOutcome, settlementFromState } from "../../lib/present";
import { useAttempts, useStats } from "../../lib/use-api";
import { useEvidenceMap } from "../../lib/use-evidence";
import { TableSkeleton } from "../marketplace/skeletons";
import { RailHealthBand } from "./rail-health";
import { BarList, TwoSeriesChart, type ChartBucket } from "./two-series-chart";

const WINDOWS = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "all", label: "All" },
];

const WINDOW_MS: Readonly<Record<string, number | null>> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
  all: null,
};

function ratio(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

function bucketize(
  entries: readonly Readonly<{
    at: number;
    settled: boolean;
    delivered: boolean;
  }>[],
  windowMs: number | null,
  now: number,
): readonly ChartBucket[] {
  if (entries.length === 0) return [];
  const oldest = Math.min(...entries.map((entry) => entry.at));
  const span = windowMs ?? Math.max(now - oldest, 3600 * 1000);
  const bucketCount = 8;
  const size = span / bucketCount;
  const start = now - span;
  const buckets: ChartBucket[] = Array.from(
    { length: bucketCount },
    (_, index) => {
      const at = new Date(start + index * size);
      const label =
        span <= 24 * 3600 * 1000
          ? `${String(at.getUTCHours()).padStart(2, "0")}:00`
          : `${at.getUTCMonth() + 1}/${at.getUTCDate()}`;
      return { label, settled: 0, delivered: 0 };
    },
  );
  for (const entry of entries) {
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((entry.at - start) / size)),
    );
    const bucket = buckets[index]!;
    buckets[index] = {
      label: bucket.label,
      settled: bucket.settled + (entry.settled ? 1 : 0),
      delivered: bucket.delivered + (entry.delivered ? 1 : 0),
    };
  }
  return buckets;
}

/** `/stats` — marketplace activity and rail health (surface map 06). */
export function StatsView() {
  const [window, setWindow] = useState("7d");
  const stats = useStats(window);
  const attempts = useAttempts(100);
  const now = useMemo(() => Date.now(), []);

  const windowed = useMemo(() => {
    const span = WINDOW_MS[window] ?? null;
    return (attempts.data ?? []).filter(
      (attempt) => span === null || Date.parse(attempt.createdAt) >= now - span,
    );
  }, [attempts.data, window, now]);

  const evidence = useEvidenceMap(
    useMemo(() => windowed.map((attempt) => attempt.attemptId), [windowed]),
  );

  if (stats.loading) return <TableSkeleton />;
  if (stats.error !== null || stats.data === null) {
    return (
      <div className="app-error-band" role="alert">
        <p>Statistics query failed — {describeFailure(stats.error)}</p>
        <Button onClick={stats.reload}>Retry</Button>
      </div>
    );
  }
  const data = stats.data;

  const chartEntries = windowed.map((attempt) => ({
    at: Date.parse(attempt.createdAt),
    settled: settlementFromState(attempt.state) === "settled",
    delivered:
      deliveryOutcome(
        evidence.get(attempt.attemptId)?.delivery.status ?? "not-started",
      ) === "delivered",
  }));
  const activeSamples = chartEntries.filter(
    (entry) => entry.settled || entry.delivered,
  ).length;
  const buckets = bucketize(chartEntries, WINDOW_MS[window] ?? null, now);

  const paymentFailures = [
    {
      label: "Settlement rejected on Canton",
      count: windowed.filter((a) => a.state === "settlement-rejected").length,
    },
    {
      label: "Rejected in wallet",
      count: windowed.filter((a) => a.state === "wallet-rejected").length,
    },
    {
      label: "Wallet unsupported",
      count: windowed.filter((a) => a.state === "wallet-unsupported").length,
    },
  ].filter((entry) => entry.count > 0);

  const deliveryFailureCodes = new Map<string, number>();
  for (const attempt of windowed) {
    const detail = evidence.get(attempt.attemptId);
    if (detail?.delivery.status === "delivery-failed") {
      const code = detail.delivery.failureCode ?? "uncategorized";
      deliveryFailureCodes.set(code, (deliveryFailureCodes.get(code) ?? 0) + 1);
    }
  }

  const metricCells = [
    { label: "Payment attempts", value: String(data.attempts.total) },
    { label: "Settled payments", value: String(data.attempts.settled) },
    { label: "Successful deliveries", value: String(data.attempts.delivered) },
    { label: "Settlement rate", value: ratio(data.attempts.settlementRate) },
    { label: "Delivery rate", value: ratio(data.attempts.deliveryRate) },
    { label: "Probe observations", value: String(data.probes.observations) },
  ];

  return (
    <>
      <div className="app-page-head">
        <div>
          <h1 className="app-page-title">Statistics and health</h1>
          <p className="app-page-sub">
            Sotto-observed activity on the Canton DevNet rail — window{" "}
            {data.window}.
          </p>
        </div>
        <div className="app-head-actions">
          <Select options={WINDOWS} value={window} onValueChange={setWindow} />
        </div>
      </div>

      <div className="app-statband" role="group" aria-label="Activity totals">
        {metricCells.map((cell) => (
          <div className="app-stat" key={cell.label}>
            <span className="app-stat-label">{cell.label}</span>
            <span className="app-stat-value">{cell.value}</span>
          </div>
        ))}
      </div>

      <div className="app-band">
        <p className="app-band-title">Settlements vs deliveries over time</p>
        {attempts.error !== null ? (
          <p style={{ margin: 0 }}>
            The attempt feed is unavailable, so no trend can be drawn from real
            timestamps.
          </p>
        ) : activeSamples < 3 ? (
          <p style={{ margin: 0 }}>
            Not enough data for trend — {activeSamples}{" "}
            {activeSamples === 1 ? "sample" : "samples"} in this window.
          </p>
        ) : (
          <TwoSeriesChart buckets={buckets} />
        )}
      </div>

      <div className="app-band">
        <p className="app-band-title">Payment failure categories</p>
        {paymentFailures.length === 0 ? (
          <p style={{ margin: 0 }}>No payment failures in this window.</p>
        ) : (
          <BarList
            entries={paymentFailures}
            tone="rosso"
            total={Math.max(1, data.attempts.total)}
          />
        )}
      </div>

      <div className="app-band">
        <p className="app-band-title">Delivery failure categories</p>
        {deliveryFailureCodes.size === 0 ? (
          <p style={{ margin: 0 }}>No delivery failures in this window.</p>
        ) : (
          <BarList
            entries={[...deliveryFailureCodes.entries()].map(
              ([label, count]) => ({ label, count }),
            )}
            tone="rosso"
            total={Math.max(1, data.attempts.settled)}
          />
        )}
      </div>

      <div className="app-band">
        <p className="app-band-title">Resource health inventory</p>
        <BarList
          entries={[
            { label: "Healthy", count: data.probes.healthy },
            { label: "Degraded", count: data.probes.degraded },
            { label: "Failing", count: data.probes.failing },
          ]}
          tone="verde"
          total={Math.max(1, data.probes.observations)}
        />
        <p className="app-note">
          {data.probes.observations} probe observations in this window · healthy
          rate {ratio(data.probes.healthyRate)}.
        </p>
      </div>

      <RailHealthBand rail={data.railHealth} sourceCommit={data.sourceCommit} />

      <p className="app-note">
        Calculated {formatUtc(new Date(now))} from persisted journal rows — CC
        amounts are test value on DevNet.
      </p>
    </>
  );
}
