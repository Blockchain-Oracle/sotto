const MAX_RESPONSE_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 300_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Outcome of one signer internal call: the real upstream status plus its
 * parsed JSON body. The API never rewrites a signer failure into success —
 * 503/502 pass through so "five-north-unavailable" stays honest end to end.
 */
export type SignerWalletResult = Readonly<{
  status: number;
  body: Readonly<Record<string, unknown>>;
}>;

export type SignerWalletClient = Readonly<{
  createWallet(
    ownerHint: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerWalletResult>;
  fundWallet(
    walletId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerWalletResult>;
  linkWallet(
    walletId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerWalletResult>;
  readWalletProfile(
    walletId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerWalletResult>;
  readWalletProfileByParty(
    partyId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<SignerWalletResult>;
}>;

export type SignerWalletClientInput = Readonly<{
  baseUrl: string;
  token: string;
  fetcher?: Fetcher;
}>;

function boundedText(value: unknown, label: string, maximum = 2_048): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximum
  ) {
    throw new Error(`signer ${label} is invalid`);
  }
  return value;
}

async function readBoundedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("signer response exceeds its byte boundary");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("signer response body is absent");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("signer response exceeds its byte boundary");
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("signer response is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("signer response is not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Thin bearer-token client for the signer service's internal wallet
 * surface: `POST /internal/wallets`, `POST /internal/wallets/:id/fund`,
 * `POST /internal/wallets/:id/link`, and
 * `GET /internal/wallets/:id/profile`. Reads are byte-bounded and
 * abort-aware; the bearer token never appears in an error.
 */
export function createSignerWalletClient(
  input: SignerWalletClientInput,
): SignerWalletClient {
  const baseUrl = boundedText(input.baseUrl, "service URL").replace(/\/$/u, "");
  const token = boundedText(input.token, "service token", 4_096);
  const fetcher = input.fetcher ?? fetch;

  async function send(
    path: string,
    init: Readonly<{ method: "GET" | "POST"; body?: string }>,
    signal: AbortSignal,
  ): Promise<SignerWalletResult> {
    if (signal.aborted) throw new Error("signer request cancelled");
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        redirect: "error",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
    } catch {
      // The signer was unreachable (transport/timeout): a failed dependency,
      // not this API's own error. 424 (not 5xx) so a fronting CDN passes the
      // readable body through instead of substituting its own 502 page.
      return Object.freeze({
        status: 424,
        body: Object.freeze({
          error: "wallet-service-unreachable",
          detail:
            "The wallet service did not respond. Onboarding is temporarily " +
            "unavailable — please try again shortly.",
        }),
      });
    }
    let body: Record<string, unknown>;
    try {
      body = await readBoundedJson(response);
    } catch {
      // A non-JSON body (e.g. a reverse-proxy 502 error page) is a failed
      // dependency, not success. 424 keeps the readable reason intact through a
      // fronting CDN that would otherwise replace an origin 5xx with its own page.
      return Object.freeze({
        status: 424,
        body: Object.freeze({
          error: "wallet-service-unavailable",
          detail:
            `The wallet service could not complete onboarding (upstream HTTP ${response.status}). ` +
            "Onboarding is temporarily unavailable — please try again shortly.",
        }),
      });
    }
    return Object.freeze({
      status: response.status,
      body: Object.freeze(body),
    });
  }

  return Object.freeze({
    createWallet: async (ownerHint, { signal }) =>
      send(
        "/internal/wallets",
        {
          method: "POST",
          body: JSON.stringify({
            ownerHint: boundedText(ownerHint, "owner hint", 64),
          }),
        },
        signal,
      ),
    fundWallet: async (walletId, { signal }) =>
      send(
        `/internal/wallets/${encodeURIComponent(boundedText(walletId, "wallet ID"))}/fund`,
        { method: "POST" },
        signal,
      ),
    linkWallet: async (walletId, { signal }) =>
      send(
        `/internal/wallets/${encodeURIComponent(boundedText(walletId, "wallet ID"))}/link`,
        { method: "POST" },
        signal,
      ),
    readWalletProfile: async (walletId, { signal }) =>
      send(
        `/internal/wallets/${encodeURIComponent(boundedText(walletId, "wallet ID"))}/profile`,
        { method: "GET" },
        signal,
      ),
    readWalletProfileByParty: async (partyId, { signal }) =>
      send(
        `/internal/wallets/by-party/${encodeURIComponent(boundedText(partyId, "party ID", 512))}/profile`,
        { method: "GET" },
        signal,
      ),
  });
}
