import type { ReactNode } from "react";

/**
 * card — a single record on a surface (DESIGN.md §7, binding): cards are
 * individual records only. Never nest a card inside a card and never wrap
 * a work surface in a decorative outer card.
 */
export interface CardProps {
  title?: string;
  /** Right-aligned header slot, e.g. a StateChipPair or CopyChip. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, aside, children, className }: CardProps) {
  return (
    <section className={["sv-card", className].filter(Boolean).join(" ")}>
      {title !== undefined || aside !== undefined ? (
        <header className="sv-card-head">
          {title === undefined ? (
            <span />
          ) : (
            <h3 className="sv-card-title">{title}</h3>
          )}
          {aside === undefined ? null : (
            <div className="sv-card-aside">{aside}</div>
          )}
        </header>
      ) : null}
      {children}
    </section>
  );
}
