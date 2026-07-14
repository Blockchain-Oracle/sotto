import {
  hasControlCharacter,
  type ApprovedFiveNorthPrepareNetwork,
} from "./five-north-prepare-network.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type CachedToken = Readonly<{ refreshAt: number; value: string }>;

export type FiveNorthTokenProvider = Readonly<{
  accessToken: () => Promise<string>;
  invalidate: () => void;
}>;

const TOKEN_RESPONSE_LIMIT = 65_536;
const MAX_TOKEN_BYTES = 16_384;
const MAX_TOKEN_LIFETIME_SECONDS = 86_400;

function requireAccessToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > MAX_TOKEN_BYTES ||
    hasControlCharacter(value)
  ) {
    throw new Error("OIDC response requires a bounded access_token");
  }
  return value;
}

export function readFiveNorthAccessTokenSubject(token: string): string {
  requireAccessToken(token);
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1] === undefined) {
    throw new Error("Five North access token is not a JWT");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Five North access token payload is invalid");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    typeof (payload as Record<string, unknown>).sub !== "string"
  ) {
    throw new Error("Five North access token subject is invalid");
  }
  const subject = (payload as { sub: string }).sub;
  if (
    subject === "" ||
    subject.trim() !== subject ||
    Buffer.byteLength(subject, "utf8") > 255 ||
    hasControlCharacter(subject)
  ) {
    throw new Error("Five North access token subject is invalid");
  }
  return subject;
}

function requireLifetime(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error("OIDC response requires bounded expires_in");
  }
  return value as number;
}

export function createFiveNorthTokenProvider(
  network: ApprovedFiveNorthPrepareNetwork,
  fetcher: Fetcher,
  scopeSignal: AbortSignal,
): FiveNorthTokenProvider {
  let cached: CachedToken | undefined;
  let inFlight: Promise<CachedToken> | undefined;

  function requireActive(): void {
    if (scopeSignal.aborted) {
      throw new Error("Five North prepare scope cancelled");
    }
  }

  async function mint(): Promise<CachedToken> {
    requireActive();
    const response = await fetcher(network.tokenUrl, {
      body: new URLSearchParams({
        audience: network.audience,
        client_id: network.clientId,
        client_secret: network.clientSecret,
        grant_type: "client_credentials",
        scope: network.scope,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([scopeSignal, AbortSignal.timeout(10_000)]),
    });
    const payload = parseFiveNorthJson(
      await readFiveNorthResponse(response, TOKEN_RESPONSE_LIMIT),
      "OIDC response",
    );
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new Error("OIDC response must be an object");
    }
    const record = payload as Record<string, unknown>;
    const lifetime = requireLifetime(record.expires_in);
    const lifetimeMs = lifetime * 1_000;
    const skew = Math.min(300_000, Math.floor(lifetimeMs / 10));
    return Object.freeze({
      refreshAt: Date.now() + lifetimeMs - skew,
      value: requireAccessToken(record.access_token),
    });
  }

  async function accessToken(): Promise<string> {
    requireActive();
    if (cached !== undefined && Date.now() < cached.refreshAt) {
      return cached.value;
    }
    inFlight ??= mint();
    try {
      cached = await inFlight;
      requireActive();
      return cached.value;
    } catch (error) {
      requireActive();
      throw error;
    } finally {
      inFlight = undefined;
    }
  }

  return Object.freeze({
    accessToken,
    invalidate() {
      cached = undefined;
    },
  });
}
