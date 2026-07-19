/**
 * The journal-state vocabulary, mirrored verbatim from the database schema
 * (`sotto.purchase_attempts` / `sotto.attempt_events` in migration
 * 0010_human_reconciliation.sql and `sotto.delivery_claims` in
 * 0011_paid_delivery.sql). Settlement and delivery stay separate facts —
 * a "settled" attempt is not "delivered" until the delivery claim says so.
 */
export const ATTEMPT_EVENT_TYPES = Object.freeze([
  "intent-created",
  "prepared-hash-verified",
  "approval-requested",
  "wallet-rejected",
  "wallet-unsupported",
  "signature-verified",
  "execution-started",
  "settlement-reconciled",
  "settlement-rejected",
] as const);

export type AttemptEventType = (typeof ATTEMPT_EVENT_TYPES)[number];

export type AttemptState = AttemptEventType;

/** Attempt states after which the purchase journal appends nothing further. */
export const TERMINAL_ATTEMPT_STATES = Object.freeze([
  "wallet-rejected",
  "wallet-unsupported",
  "settlement-reconciled",
  "settlement-rejected",
] as const);

export type TerminalAttemptState = (typeof TERMINAL_ATTEMPT_STATES)[number];

export const DELIVERY_CLAIM_STATES = Object.freeze([
  "ready",
  "leased",
  "dispatching",
  "delivered",
  "delivery-failed",
  "delivery-unknown",
] as const);

export type DeliveryClaimState = (typeof DELIVERY_CLAIM_STATES)[number];

/** Delivery claim states after which the delivery worker stops. */
export const TERMINAL_DELIVERY_STATES = Object.freeze([
  "delivered",
  "delivery-failed",
  "delivery-unknown",
] as const);

export function isTerminalAttemptState(
  state: string,
): state is TerminalAttemptState {
  return (TERMINAL_ATTEMPT_STATES as readonly string[]).includes(state);
}

export function isTerminalDeliveryState(state: string): boolean {
  return (TERMINAL_DELIVERY_STATES as readonly string[]).includes(state);
}

/**
 * The paired outcome of one attempt, never merged into a generic success:
 * `settled` and `delivered` are separate booleans, and the honest
 * settled-undelivered case is representable.
 */
export type PairedOutcome = Readonly<{
  settled: boolean;
  settlementRejected: boolean;
  delivered: boolean;
  deliveryFailed: boolean;
  deliveryPending: boolean;
}>;

export function pairedOutcome(
  attemptState: string,
  deliveryClaimState: string | null,
): PairedOutcome {
  const settled = attemptState === "settlement-reconciled";
  const delivered = deliveryClaimState === "delivered";
  const deliveryFailed =
    deliveryClaimState === "delivery-failed" ||
    deliveryClaimState === "delivery-unknown";
  return Object.freeze({
    settled,
    settlementRejected: attemptState === "settlement-rejected",
    delivered,
    deliveryFailed,
    deliveryPending: settled && !delivered && !deliveryFailed,
  });
}
