/**
 * Evidence formatting rules (DESIGN.md §6, binding).
 *
 * - Party IDs keep hint + first/last of the fingerprint: `merchant-ctai::1220…c397b`
 * - Update IDs keep first-8 + last-4: `1220a91e…7c2f`
 * - Copy actions always return the FULL value (see copy-chip).
 * - URLs show origin + route, never an ellipsized hostname.
 * - Amounts always carry the asset; render with the mono/tabular class.
 * - Relative time in lists, exact UTC in detail views.
 */

const ELLIPSIS = "…";

/** `sotto-owner::1220a91efc…8a91` → `sotto-owner::1220…8a91`. */
export function truncateParty(partyId: string): string {
  const separator = partyId.indexOf("::");
  if (separator === -1) return truncateFingerprint(partyId);
  const hint = partyId.slice(0, separator);
  const fingerprint = partyId.slice(separator + 2);
  return `${hint}::${truncateFingerprint(fingerprint)}`;
}

function truncateFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 12) return fingerprint;
  return `${fingerprint.slice(0, 4)}${ELLIPSIS}${fingerprint.slice(-5)}`;
}

/** `1220a91e44…be7c2f` → `1220a91e…7c2f`. */
export function truncateUpdateId(updateId: string): string {
  if (updateId.length <= 14) return updateId;
  return `${updateId.slice(0, 8)}${ELLIPSIS}${updateId.slice(-4)}`;
}

/** Amounts always carry the asset: `0.25 CC`. */
export function formatAmount(value: string | number, asset: string): string {
  return `${typeof value === "number" ? String(value) : value.trim()} ${asset}`;
}

/** Origin + route, never an ellipsized hostname. */
export function formatUrl(url: string): string {
  const parsed = new URL(url);
  const route = parsed.pathname === "/" ? "" : parsed.pathname;
  return `${parsed.origin}${route}`;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** Exact UTC for detail views: `2026-07-19 14:03:22 UTC`. */
export function formatUtc(at: Date): string {
  const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
  const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
  return `${date} ${time} UTC`;
}

/** Short UTC clock for rail marks: `14:03:22`. */
export function formatUtcClock(at: Date): string {
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
}

/** Relative time for lists: `12s ago`, `4m ago`, `2h ago`, `3d ago`. */
export function formatRelative(at: Date, now: Date): string {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - at.getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Remaining time against a real expiry: `2h 04m`, `4m 12s`, `42s`, `expired`. */
export function formatCountdown(until: Date, now: Date): string {
  const seconds = Math.floor((until.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return "expired";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}
