import type { ReactNode } from "react";

/**
 * veil — the filigrana redaction boundary (DESIGN.md §5).
 *
 * Withheld fields sit behind a diagonal watermark hatch with the exact
 * reason line (e.g. "Private resource context"). When the reader is
 * authorized (`veiled={false}`) the content renders plainly — there is no
 * theatrical "reveal" animation of private data, and veiled content is
 * never rendered underneath the hatch.
 */
export interface VeilProps {
  /** Exact reason the field is withheld, e.g. "Private resource context". */
  reason: string;
  /** False for the authorized reader: children render un-veiled. */
  veiled?: boolean;
  /** Preserves the geometry of the withheld field. */
  minHeight?: number;
  children?: ReactNode;
  className?: string;
}

export function Veil({
  reason,
  veiled = true,
  minHeight,
  children,
  className,
}: VeilProps) {
  if (!veiled) return <>{children}</>;
  return (
    <div
      className={["sv-veil", className].filter(Boolean).join(" ")}
      style={minHeight === undefined ? undefined : { minHeight }}
    >
      <span className="sv-veil-reason">{reason}</span>
    </div>
  );
}
