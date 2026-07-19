import { useEffect, useRef } from "react";
import { formatUtcClock } from "../format.js";

/**
 * system-rail — the engraved purchase lifecycle (DESIGN.md §5).
 *
 * A horizontal staff line on which each REAL journal/probe event lands as
 * an engraved mark. Settlement renders as the verde double barline; events
 * without a timestamp render as hollow pending marks. The one-shot
 * cue → sound → decay animation fires ONLY when an event's `at` timestamp
 * is newly provided across renders — never on a timer, never on first
 * mount of already-committed history.
 */
export interface RailEvent {
  key: string;
  label: string;
  /** The REAL committed time of the event. Absent = pending. */
  at?: Date;
  kind: "mark" | "settlement" | "pending";
}

export interface SystemRailProps {
  events: RailEvent[];
  /** Accessible name for the rail, e.g. "Purchase lifecycle". */
  label?: string;
  className?: string;
}

/**
 * Committed events keep chronological order by `at`; pending events keep
 * their given order after every committed event. Stable for ties.
 */
export function orderRailEvents(events: RailEvent[]): RailEvent[] {
  const committed = events.filter((event) => event.at !== undefined);
  const pending = events.filter((event) => event.at === undefined);
  const byTime = committed
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        (a.event.at as Date).getTime() - (b.event.at as Date).getTime() ||
        a.index - b.index,
    )
    .map((entry) => entry.event);
  return [...byTime, ...pending];
}

/**
 * One-shot gating: an event sounds only when it has `at` now and was not
 * in the previously-sounded set. Pure so it is testable without a DOM.
 */
export function resolveFreshSounds(
  previous: ReadonlySet<string>,
  events: RailEvent[],
): Set<string> {
  const fresh = new Set<string>();
  for (const event of events) {
    if (event.at !== undefined && !previous.has(event.key)) {
      fresh.add(event.key);
    }
  }
  return fresh;
}

export function SystemRail({ events, label, className }: SystemRailProps) {
  const sounded = useRef<Set<string> | null>(null);
  const mounted = sounded.current !== null;
  const previous: ReadonlySet<string> =
    sounded.current ?? new Set(events.filter((e) => e.at).map((e) => e.key));
  const fresh = mounted ? resolveFreshSounds(previous, events) : new Set();

  useEffect(() => {
    const next = sounded.current ?? new Set<string>();
    for (const event of events) {
      if (event.at !== undefined) next.add(event.key);
    }
    sounded.current = next;
  }, [events]);

  const ordered = orderRailEvents(events);
  return (
    <div
      className={["sv-rail", className].filter(Boolean).join(" ")}
      role="list"
      aria-label={label ?? "Lifecycle"}
    >
      <span className="sv-rail-staff" aria-hidden="true" />
      {ordered.map((event) => (
        <div className="sv-rail-event" role="listitem" key={event.key}>
          <span
            className={["sv-rail-mark", fresh.has(event.key) ? "sv-sound" : ""]
              .filter(Boolean)
              .join(" ")}
            data-kind={event.at === undefined ? "pending" : event.kind}
            aria-hidden="true"
          >
            {event.kind === "settlement" && event.at !== undefined ? (
              <>
                <span className="sv-rail-bar" />
                <span className="sv-rail-bar sv-rail-bar-thick" />
              </>
            ) : null}
          </span>
          <span className="sv-rail-label">{event.label}</span>
          <span className="sv-rail-at">
            {event.at === undefined ? "—" : formatUtcClock(event.at)}
          </span>
        </div>
      ))}
    </div>
  );
}
