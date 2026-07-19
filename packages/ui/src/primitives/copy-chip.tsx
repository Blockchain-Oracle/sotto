import { useState } from "react";
import { truncateParty, truncateUpdateId } from "../format.js";

/**
 * copy-chip — truncated evidence ID that copies the FULL value
 * (DESIGN.md §6). Truncation by kind: party = hint + first/last
 * (`merchant-ctai::1220…c397b`), update = first-8 + last-4
 * (`1220a91e…7c2f`). The copied state clears on pointer-leave/blur, not on
 * a timer.
 */
export interface CopyChipProps {
  /** The FULL value; always what lands on the clipboard. */
  value: string;
  kind?: "party" | "update" | "generic";
  /** Optional explicit display override (must still be honest). */
  display?: string;
  className?: string;
}

export function CopyChip({
  value,
  kind = "generic",
  display,
  className,
}: CopyChipProps) {
  const [copied, setCopied] = useState(false);
  const shown =
    display ??
    (kind === "party"
      ? truncateParty(value)
      : kind === "update"
        ? truncateUpdateId(value)
        : value);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => setCopied(true));
  };
  return (
    <button
      type="button"
      className={["sv-copy", className].filter(Boolean).join(" ")}
      data-copied={copied ? "true" : undefined}
      onClick={copy}
      onMouseLeave={() => setCopied(false)}
      onBlur={() => setCopied(false)}
      aria-label={`Copy ${value}`}
      title={value}
    >
      <span className="sv-copy-value">{shown}</span>
      <span className="sv-copy-state" aria-hidden="true">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
