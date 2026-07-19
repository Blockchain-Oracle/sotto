/**
 * One exit code per distinct terminal fact, so scripts can branch on the
 * paired settlement/delivery outcome without parsing copy. Ambiguous
 * outcomes (8) must never be auto-retried — the CLI prints reconcile
 * guidance instead of spending twice.
 */
export const EXIT = Object.freeze({
  /** Read succeeded, or the purchase settled AND delivered. */
  ok: 0,
  /** Transport failure, API failure, or an unexpected error. */
  failure: 1,
  /** The command line itself was invalid. */
  usage: 2,
  /** No usable owner session (token absent, expired, or revoked). */
  auth: 3,
  /** The human wallet rejected this exact prepared call. */
  walletRejected: 4,
  /** The wallet cannot sign this prepared transaction shape. */
  walletUnsupported: 5,
  /** Canton rejected the settlement; no value moved. */
  settlementRejected: 6,
  /** The execute-before deadline passed without a terminal journal event. */
  expired: 7,
  /** Settled but not delivered, or otherwise ambiguous — reconcile, never retry. */
  ambiguous: 8,
} as const);

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
