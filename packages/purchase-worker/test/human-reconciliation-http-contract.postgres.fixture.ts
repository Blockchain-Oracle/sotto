export const LOCAL_RECONCILIATION_PATH = "/internal/human-reconciliation/read";
export const MAXIMUM_RECONCILIATION_REQUEST_BYTES = 8_192;
export const MAXIMUM_RECONCILIATION_RESPONSE_BYTES = 2_000_000;
export const RECONCILIATION_TRANSPORT_TIMEOUT_MS = 5_000;

export function requireBoundedContentLength(
  value: string | undefined,
  maximum: number,
): void {
  if (value === undefined) return;
  if (!/^(?:0|[1-9]\d*)$/u.test(value) || Number(value) > maximum) {
    throw new Error("local reconciliation content length is invalid");
  }
}
