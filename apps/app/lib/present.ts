import type { DeliveryOutcome, SettlementOutcome } from "@sotto/ui";

/**
 * Presentation mapping from persisted API states to the design system's
 * vocabulary. Amounts arrive as atomic strings (10 decimal places on the
 * Canton amulet scale — packages/x402-canton SCALE); display always
 * carries the asset.
 */

const ATOMIC_DECIMALS = 10;

export function atomicToDecimal(atomic: string): string {
  if (!/^[0-9]+$/u.test(atomic)) return atomic;
  const padded = atomic.padStart(ATOMIC_DECIMALS + 1, "0");
  const whole = padded.slice(0, -ATOMIC_DECIMALS);
  const fraction = padded.slice(-ATOMIC_DECIMALS).replace(/0+$/u, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

export function formatAtomicAmount(atomic: string, asset: string): string {
  return `${atomicToDecimal(atomic)} ${asset}`;
}

/** Attempt journal state → the paired settlement outcome. */
export function settlementFromState(state: string): SettlementOutcome {
  if (state === "settlement-reconciled") return "settled";
  if (
    state === "settlement-rejected" ||
    state === "wallet-rejected" ||
    state === "wallet-unsupported"
  ) {
    return "failed";
  }
  return "pending";
}

export function deliveryOutcome(
  status: "not-started" | "delivery-pending" | "delivered" | "delivery-failed",
): DeliveryOutcome {
  if (status === "delivered") return "delivered";
  if (status === "delivery-failed") return "failed";
  return "pending";
}

/** Human labels for journal event types, per surface-map DC-2 vocabulary. */
export const EVENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "intent-created": "Live 402 observed, intent journaled",
  "prepared-hash-verified": "Prepared transaction hash verified",
  "approval-requested": "Human wallet approval requested",
  "wallet-rejected": "Rejected in wallet",
  "wallet-unsupported": "Wallet cannot sign this transaction",
  "signature-verified": "Wallet signature verified",
  "execution-started": "Canton settlement submitted",
  "settlement-reconciled": "Canton settlement reconciled",
  "settlement-rejected": "Canton settlement rejected",
});

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

/** Source labels for the evidence timeline (surface map 05). */
export function eventSource(type: string, updateId: string | null): string {
  if (updateId !== null) return "Canton";
  if (type.startsWith("wallet-") || type === "approval-requested") {
    return "Wallet";
  }
  return "Sotto";
}

const TEMPLATE_PARAMETER = /\{([A-Za-z_][A-Za-z0-9_]{0,63})\}/gu;

/**
 * Request-input schema derived from the verified route template — the
 * exact rule the API's compose-assist uses: every `{parameter}` is one
 * required string field; a parameterless resource takes no input.
 */
export function deriveInputFields(routeTemplate: string): readonly string[] {
  const fields = new Set<string>();
  for (const match of routeTemplate.matchAll(TEMPLATE_PARAMETER)) {
    const name = match[1];
    if (name !== undefined) fields.add(name);
  }
  return Object.freeze([...fields]);
}

export type HealthTone = "verde" | "ambra" | "rosso" | "neutral";

export function healthTone(status: string): HealthTone {
  if (status === "healthy") return "verde";
  if (status === "degraded") return "ambra";
  if (status === "failing") return "rosso";
  return "neutral";
}

export function healthLabel(status: string | null): string {
  if (status === null) return "Not probed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** A probe older than this is presented as stale (Try blocked). */
export const STALE_PROBE_MS = 30 * 60 * 1000;

export function isStaleProbe(observedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(observedAt) > STALE_PROBE_MS;
}
