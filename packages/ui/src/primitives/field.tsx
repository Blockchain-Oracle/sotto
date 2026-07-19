import type { ReactNode } from "react";

/**
 * field — label + control + message row (DESIGN.md §6).
 *
 * Error copy names the failed boundary and the next safe action
 * ("Canton settlement probe unreachable — retry the probe"), never a bare
 * "Something went wrong".
 */
export interface FieldProps {
  label: string;
  /** id of the control inside, wired to the label. */
  htmlFor?: string;
  hint?: string;
  /** Failed boundary + next safe action. Renders in rosso. */
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div
      className={["sv-field", className].filter(Boolean).join(" ")}
      data-invalid={error === undefined ? undefined : "true"}
    >
      <label className="sv-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p className="sv-field-error" role="alert">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="sv-field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
