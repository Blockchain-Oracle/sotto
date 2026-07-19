import { useId } from "react";

/**
 * The Sotto mark — "Mark 1 · The undertone" (approved at identity gate C0).
 *
 * A hairline rule with a lapis dot at its end (the dynamic-marking motif)
 * over a geometric lowercase s drawn as a single engraved stroke. The rule
 * and the s render in currentColor (ink); only the dot carries the lapis
 * accent. Geometry is fixed — never redraw, skew, or restyle it.
 *
 * `variant="glyph"` drops the rule + dot and recenters the s for favicon
 * and small-size use.
 */
export interface SottoMarkProps {
  variant?: "full" | "glyph";
  /** Rendered height in px; the mark is square (64-unit viewBox). */
  size?: number;
  title?: string;
  className?: string;
}

export function SottoMark({
  variant = "full",
  size = 32,
  title = "Sotto",
  className,
}: SottoMarkProps) {
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
      {variant === "full" ? (
        <>
          <path
            d="M 44 7 L 14 7"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <circle cx={51} cy={7} r={4.2} fill="var(--lapis)" />
          <path
            d="M 41 27 A 9 9 0 0 0 23 27 A 9 10 0 0 0 32 37 A 9 10 0 0 1 41 47 A 9 9 0 0 1 23 47"
            stroke="currentColor"
            strokeWidth={7}
            strokeLinecap="round"
          />
        </>
      ) : (
        <path
          d="M 41 22 A 9 9 0 0 0 23 22 A 9 10 0 0 0 32 32 A 9 10 0 0 1 41 42 A 9 9 0 0 1 23 42"
          stroke="currentColor"
          strokeWidth={8}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
