import { useId } from "react";

/**
 * The dynamic marking — Sotto's in-product punctuation glyph: a hairline
 * rule with the lapis dot set below it, like an engraved dynamic
 * instruction under the staff. Used as a section punctuation, never as a
 * decorative repeat pattern.
 */
export interface DynamicMarkingProps {
  /** Rendered height in px; the glyph is square (64-unit viewBox). */
  size?: number;
  title?: string;
  className?: string;
}

export function DynamicMarking({
  size = 24,
  title = "Sotto marking",
  className,
}: DynamicMarkingProps) {
  const titleId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-labelledby={titleId}
      className={className}
      fill="none"
    >
      <title id={titleId}>{title}</title>
      <path
        d="M 10 24 L 54 24"
        stroke="currentColor"
        strokeWidth={2.8}
        strokeLinecap="round"
      />
      <circle cx={26} cy={41} r={6.5} fill="var(--lapis)" />
    </svg>
  );
}
