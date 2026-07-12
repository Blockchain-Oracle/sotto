import {
  createChallengeObservation,
  decodePaymentRequired,
  selectCantonRequirement,
  type ChallengeObservation,
} from "./observation.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type UrlAuthority = (url: URL) => Promise<void>;

type ObserveInput = Readonly<{
  authorizeUrl?: UrlAuthority;
  fetcher: Fetcher;
  method: string;
  now?: Date;
  requestBody?: string;
  resourceUrl: string;
  timeoutMs?: number;
}>;

export async function observeHttpChallenge(
  input: ObserveInput,
): Promise<ChallengeObservation> {
  const url = new URL(input.resourceUrl);
  if (url.protocol !== "https:") {
    throw new Error("Paid provider URL must use HTTPS");
  }
  if (input.authorizeUrl === undefined) {
    throw new Error("HTTP observation requires a URL authority check");
  }
  await input.authorizeUrl(url);

  const timeoutMs = input.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("HTTP observation timeout must be 1-10000ms");
  }
  const response = await input.fetcher(url.toString(), {
    ...(input.requestBody === undefined ? {} : { body: input.requestBody }),
    method: input.method.toUpperCase(),
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 402) {
    throw new Error(
      `Paid provider expected HTTP 402, received ${response.status}`,
    );
  }

  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header === null || header.trim() === "") {
    throw new Error("HTTP 402 requires a v2 PAYMENT-REQUIRED header");
  }
  const now = input.now ?? new Date();
  const challenge = selectCantonRequirement(decodePaymentRequired(header), now);
  return createChallengeObservation({
    challenge,
    method: input.method,
    observedAt: now.toISOString(),
    ...(input.requestBody === undefined
      ? {}
      : { requestBody: input.requestBody }),
    resourceUrl: url.toString(),
  });
}
