import type { ReactNode } from "react";

/**
 * rest-state — designed empty state (DESIGN.md §5): the honest zero as
 * anticipation, marked with an engraved rest (a small bar hung under a
 * hairline — abstracted, never a literal musical glyph).
 *
 * Copy rules (binding): never apology copy ("No data yet, sorry"), never
 * fake placeholder data. State the honest zero and offer exactly ONE real
 * next action.
 */
export interface RestStateProps {
  /** The honest zero, e.g. "No settlements recorded". */
  title: string;
  /** One line of anticipation, e.g. "The first real Canton update lands here." */
  detail?: string;
  /** Exactly one real next action (a Button or link). */
  action?: ReactNode;
  className?: string;
}

export function RestState({
  title,
  detail,
  action,
  className,
}: RestStateProps) {
  return (
    <div className={["sv-rest", className].filter(Boolean).join(" ")}>
      <span className="sv-rest-mark" aria-hidden="true">
        <span className="sv-rest-line" />
        <span className="sv-rest-block" />
      </span>
      <p className="sv-rest-title">{title}</p>
      {detail === undefined ? null : <p className="sv-rest-detail">{detail}</p>}
      {action === undefined ? null : (
        <div className="sv-rest-action">{action}</div>
      )}
    </div>
  );
}
