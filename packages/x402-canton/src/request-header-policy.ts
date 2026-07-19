const FORBIDDEN_REQUEST_AUTHORITY_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "expect",
  "host",
  "keep-alive",
  "payment-signature",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-payment",
  "x-payment-signature",
]);

export function isForbiddenRequestAuthorityHeader(name: string): boolean {
  return FORBIDDEN_REQUEST_AUTHORITY_HEADERS.has(name.toLowerCase());
}
