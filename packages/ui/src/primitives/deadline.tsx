import { useEffect, useState } from "react";
import { formatCountdown } from "../format.js";

/**
 * deadline — countdown against a REAL expiry value such as
 * `executeBefore` (DESIGN.md §4/§5). This is the ONLY time-driven
 * component in the system; every other progress surface advances on real
 * events. The clock is injectable so tests render against a fixed time.
 */
export interface DeadlineProps {
  /** The real expiry instant (never a synthetic target). */
  until: Date;
  /** Label naming the boundary, e.g. "Execute before". */
  label?: string;
  /** Seconds remaining at which the ambra expiring state applies. */
  expiringUnderSeconds?: number;
  /** Injectable clock (tests pass a fixed one). */
  now?: () => Date;
  className?: string;
}

export function Deadline({
  until,
  label,
  expiringUnderSeconds = 60,
  now,
  className,
}: DeadlineProps) {
  const clock = now ?? (() => new Date());
  const [tick, setTick] = useState(() => clock());

  useEffect(() => {
    const read = now ?? (() => new Date());
    const interval = setInterval(() => setTick(read()), 1000);
    return () => clearInterval(interval);
  }, [now]);

  const remainingSeconds = Math.floor(
    (until.getTime() - tick.getTime()) / 1000,
  );
  const state =
    remainingSeconds <= 0
      ? "expired"
      : remainingSeconds <= expiringUnderSeconds
        ? "expiring"
        : "counting";
  return (
    <span
      className={["sv-deadline", className].filter(Boolean).join(" ")}
      data-state={state}
    >
      {label === undefined ? null : (
        <span className="sv-deadline-label">{label}</span>
      )}
      <span className="sv-deadline-value">
        {state === "expired" ? "Expired" : formatCountdown(until, tick)}
      </span>
    </span>
  );
}
