/**
 * The one error taxonomy every Sotto surface shares. Codes mirror the API's
 * `error` field verbatim — the client never invents, renames, or collapses a
 * server code, so CLI, MCP, and app render identical failures.
 */
export const SOTTO_API_ERROR_CODES = Object.freeze([
  "attempt-unknown",
  "challenge-invalid",
  "compose-assist-unavailable",
  "compose-request-invalid",
  "database-unavailable",
  "five-north-unavailable",
  "listing-id-missing",
  "listing-not-quarantinable",
  "listing-not-restorable",
  "listing-unknown",
  "not-implemented",
  "ops-token-required",
  "ops-unavailable",
  "origin-owned-elsewhere",
  "origin-unknown",
  "origin-url-invalid",
  "owner-hint-invalid",
  "party-id-invalid",
  "party-proof-rejected",
  "payer-profile-unavailable",
  "price-changed",
  "probe-not-x402",
  "provider-name-invalid",
  "provider-unreachable",
  "publication-ineligible",
  "publication-request-invalid",
  "publication-stale",
  "purchase-initiation-failed",
  "resource-unknown",
  "route-parameters-unsupported",
  "session-required",
  "signer-response-invalid",
  "verification-fields-missing",
  "wallet-id-invalid",
  "wallet-unknown",
] as const);

export type SottoApiErrorCode = (typeof SOTTO_API_ERROR_CODES)[number];

/** A non-2xx API answer, carried whole: status, server code, and detail. */
export class SottoApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string | undefined;
  readonly body: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    body: Readonly<Record<string, unknown>>,
    fallbackCode: string,
  ) {
    const code = typeof body.error === "string" ? body.error : fallbackCode;
    const detail = typeof body.detail === "string" ? body.detail : undefined;
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "SottoApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.body = body;
  }
}

/** The API answered, but not with the shape this client version expects. */
export class SottoResponseShapeError extends Error {
  constructor(context: string) {
    super(`The API response did not carry the expected shape: ${context}`);
    this.name = "SottoResponseShapeError";
  }
}

/** The transport failed before any API answer existed (DNS, refused, abort). */
export class SottoTransportError extends Error {
  override readonly cause: unknown;

  constructor(context: string, cause: unknown) {
    super(`The Sotto API was unreachable: ${context}`);
    this.name = "SottoTransportError";
    this.cause = cause;
  }
}

/** A response body exceeded the bounded read limit; nothing was truncated silently. */
export class SottoResponseTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(
      `The API response exceeded the bounded read limit of ${limitBytes} bytes`,
    );
    this.name = "SottoResponseTooLargeError";
  }
}
