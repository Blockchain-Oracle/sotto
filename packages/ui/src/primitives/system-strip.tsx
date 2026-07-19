import type { ReactNode } from "react";

/**
 * system-strip — the single global system-condition line (DESIGN.md §5):
 * network-level truths only ("DevNet reset scheduled", "Settlement probe
 * delayed 4m"). Never per-record status, never marketing, and "Live"
 * never appears without a timestamp (DESIGN.md §6).
 */
export interface SystemStripProps {
  tone?: "neutral" | "ambra" | "rosso";
  children: ReactNode;
  /** One optional secondary action, e.g. "View status". */
  action?: ReactNode;
  className?: string;
}

export function SystemStrip({
  tone = "neutral",
  children,
  action,
  className,
}: SystemStripProps) {
  return (
    <div
      className={["sv-strip", className].filter(Boolean).join(" ")}
      data-tone={tone}
      role="status"
    >
      <span className="sv-strip-text">{children}</span>
      {action === undefined ? null : (
        <span className="sv-strip-action">{action}</span>
      )}
    </div>
  );
}
