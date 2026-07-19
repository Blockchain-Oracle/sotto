/**
 * skeleton — geometry-preserving loading placeholder (DESIGN.md §4):
 * it reserves EXACTLY the final layout dimensions and does not shimmer
 * (no ambient motion, nothing loops).
 */
export interface SkeletonProps {
  /** Explicit final geometry, e.g. 220 or "100%". */
  width: number | string;
  height: number | string;
  radius?: number;
  className?: string;
}

export function Skeleton({
  width,
  height,
  radius = 4,
  className,
}: SkeletonProps) {
  return (
    <span
      className={["sv-skeleton", className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  /** Number of final text lines to reserve. */
  lines: number;
  /** Line height in px of the final text. */
  lineHeight?: number;
  className?: string;
}

export function SkeletonText({
  lines,
  lineHeight = 16,
  className,
}: SkeletonTextProps) {
  return (
    <span
      className={["sv-skeleton-text", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 && lines > 1 ? "62%" : "100%"}
          height={lineHeight - 6}
        />
      ))}
    </span>
  );
}
