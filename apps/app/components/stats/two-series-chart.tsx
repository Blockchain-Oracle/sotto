"use client";

/**
 * Settlements vs deliveries over time — two series, never one merged
 * "success" line. Plain SVG on theme tokens (no chart library). Buckets
 * with zero samples render at zero; the caller withholds the chart
 * entirely when there are not enough real samples for a trend.
 */
export type ChartBucket = Readonly<{
  label: string;
  settled: number;
  delivered: number;
}>;

const WIDTH = 720;
const HEIGHT = 180;
const PAD = 24;

function points(
  buckets: readonly ChartBucket[],
  pick: (bucket: ChartBucket) => number,
  max: number,
): string {
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;
  const step = buckets.length === 1 ? 0 : innerW / (buckets.length - 1);
  return buckets
    .map((bucket, index) => {
      const x = PAD + index * step;
      const y = PAD + innerH - (pick(bucket) / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");
}

export function TwoSeriesChart({
  buckets,
}: {
  buckets: readonly ChartBucket[];
}) {
  const max = Math.max(
    1,
    ...buckets.map((bucket) => Math.max(bucket.settled, bucket.delivered)),
  );
  return (
    <div>
      <svg
        className="app-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Settlements versus deliveries over time"
      >
        <line
          x1={PAD}
          y1={HEIGHT - PAD}
          x2={WIDTH - PAD}
          y2={HEIGHT - PAD}
          stroke="var(--line)"
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={HEIGHT - PAD}
          stroke="var(--line)"
        />
        <text
          x={PAD - 6}
          y={PAD + 4}
          textAnchor="end"
          fontSize={10}
          fill="var(--muted)"
          fontFamily="var(--font-mono)"
        >
          {max}
        </text>
        <polyline
          points={points(buckets, (bucket) => bucket.settled, max)}
          fill="none"
          stroke="var(--verde)"
          strokeWidth={2}
        />
        <polyline
          points={points(buckets, (bucket) => bucket.delivered, max)}
          fill="none"
          stroke="var(--ametista)"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
        {buckets.map((bucket, index) => {
          const innerW = WIDTH - PAD * 2;
          const step = buckets.length === 1 ? 0 : innerW / (buckets.length - 1);
          return (
            <text
              key={bucket.label}
              x={PAD + index * step}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={9.5}
              fill="var(--muted)"
              fontFamily="var(--font-mono)"
            >
              {bucket.label}
            </text>
          );
        })}
      </svg>
      <div className="app-chart-legend">
        <span>
          <span
            className="app-legend-swatch"
            style={{ background: "var(--verde)" }}
          />
          Settled payments
        </span>
        <span>
          <span
            className="app-legend-swatch"
            style={{ background: "var(--ametista)" }}
          />
          Successful deliveries
        </span>
      </div>
    </div>
  );
}

export function BarList({
  entries,
  tone,
  total,
}: {
  entries: readonly Readonly<{ label: string; count: number }>[];
  tone: "rosso" | "ametista" | "verde";
  total: number;
}) {
  return (
    <div className="app-bars">
      {entries.map((entry) => (
        <div className="app-bar-row" key={entry.label}>
          <span>{entry.label}</span>
          <span className="app-bar-track">
            <span
              className="app-bar-fill"
              style={{
                width: `${total === 0 ? 0 : Math.max(2, (entry.count / total) * 100)}%`,
                background: `var(--${tone})`,
              }}
            />
          </span>
          <span className="sv-num app-mono">{entry.count}</span>
        </div>
      ))}
    </div>
  );
}
