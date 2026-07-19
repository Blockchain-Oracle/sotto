import type { ReactNode, TableHTMLAttributes } from "react";

/**
 * table — dense hairline evidence table (DESIGN.md §5, §7).
 *
 * Horizontal scrolling happens only inside this container, with the
 * scrollbar kept visible as the affordance — never at page level. Numeric
 * and evidence cells take the `sv-num` class (mono, tabular-nums,
 * right-aligned).
 */
export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  /** Accessible name for the table region. */
  label?: string;
  className?: string;
}

export function Table({ children, label, className, ...rest }: TableProps) {
  return (
    <div
      className={["sv-table-scroll", className].filter(Boolean).join(" ")}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table {...rest} className="sv-table">
        {children}
      </table>
    </div>
  );
}
