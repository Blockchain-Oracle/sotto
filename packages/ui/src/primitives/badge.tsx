import type { ReactNode } from "react";

/**
 * badge — small uppercase mono tag (letter-spacing .1em, DESIGN.md §3).
 * Semantic tones only where the state warrants them (ambra for DEVNET /
 * stale / expiring, rosso for danger); never decorative color.
 */
export interface BadgeProps {
  tone?: "neutral" | "lapis" | "verde" | "ametista" | "ambra" | "rosso";
  hollow?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({
  tone = "neutral",
  hollow = false,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={["sv-badge", className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-hollow={hollow ? "true" : undefined}
    >
      {children}
    </span>
  );
}
