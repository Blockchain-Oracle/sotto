import {
  createChallengeObservation,
  decodePaymentRequired,
  selectCantonRequirement,
  type ChallengeObservation,
} from "./observation.js";
import {
  capturePaymentRequiredResponse,
  MAX_REQUEST_BODY_BYTES,
  type PaymentRequiredObservation,
} from "@sotto/x402-canton";

export type AuthorizedFetcher = (
  url: URL,
  init: RequestInit,
) => Promise<Response>;

type ObserveInput = Readonly<{
  fetchAuthorized?: AuthorizedFetcher;
  method: string;
  requestBody?: Uint8Array;
  resourceUrl: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

export type ObservedHttpChallenge = ChallengeObservation &
  Readonly<{ paymentObservation: PaymentRequiredObservation }>;

function throwObservationCancelled(): never {
  throw new Error("HTTP observation cancelled");
}

export async function observeHttpChallenge(
  input: ObserveInput,
): Promise<ObservedHttpChallenge> {
  const url = new URL(input.resourceUrl);
  if (url.protocol !== "https:") {
    throw new Error("Paid provider URL must use HTTPS");
  }
  if (input.fetchAuthorized === undefined) {
    throw new Error("HTTP observation requires an authorized fetch boundary");
  }
  if (
    input.requestBody !== undefined &&
    input.requestBody.byteLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw new Error("Request body exceeds 1048576 bytes");
  }
  const requestBody =
    input.requestBody === undefined
      ? undefined
      : Buffer.from(input.requestBody);
  const timeoutMs = input.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("HTTP observation timeout must be 1-10000ms");
  }
  const callerSignal = input.signal;
  const callerCancelled = (): boolean => input.signal?.aborted === true;
  if (callerCancelled()) {
    throwObservationCancelled();
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    callerSignal === undefined
      ? timeoutSignal
      : AbortSignal.any([callerSignal, timeoutSignal]);
  let response: Response;
  try {
    response = await input.fetchAuthorized(url, {
      ...(requestBody === undefined ? {} : { body: Buffer.from(requestBody) }),
      method: input.method.toUpperCase(),
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (callerCancelled()) {
      throwObservationCancelled();
    }
    throw error;
  }
  if (response.status !== 402) {
    throw new Error(
      `Paid provider expected HTTP 402, received ${response.status}`,
    );
  }
  const paymentObservation = capturePaymentRequiredResponse(response);

  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header === null || header.trim() === "") {
    throw new Error("HTTP 402 requires a v2 PAYMENT-REQUIRED header");
  }
  const paymentRequired = decodePaymentRequired(header);
  const challenge = selectCantonRequirement(paymentRequired);
  return {
    ...createChallengeObservation({
      challenge,
      method: input.method,
      observedAt: paymentObservation.observedAt,
      ...(requestBody === undefined ? {} : { requestBody }),
      resourceUrl: url.toString(),
      upstreamResourceUrl: paymentRequired.resource.url,
    }),
    paymentObservation,
  };
}
