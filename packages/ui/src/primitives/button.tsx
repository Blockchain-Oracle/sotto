import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * button — tokenized control (DESIGN.md §5, §7).
 *
 * Verbs for commands ("Add API", "Prepare call"), never status words.
 * The loading state preserves the control's width exactly: the label stays
 * in the layout (hidden) and a static mono ellipsis overlays it — no
 * looping spinner (no ambient motion, DESIGN.md §4).
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  loading = false,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={["sv-btn", className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-loading={loading ? "true" : undefined}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
    >
      <span className="sv-btn-label">{children}</span>
      {loading ? (
        <span className="sv-btn-wait" aria-hidden="true">
          …
        </span>
      ) : null}
    </button>
  );
}
