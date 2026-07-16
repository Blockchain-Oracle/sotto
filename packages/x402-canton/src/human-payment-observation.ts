import { randomBytes } from "node:crypto";
import type {
  HumanPaymentAuthority,
  HumanPaymentFetcher,
  HumanPaymentFetchRequest,
  HumanPaymentObservationOptions,
  HumanPaymentObserver,
} from "./human-payment-observation-types.js";
import {
  capturePaymentRequiredResponse,
  readPaymentRequiredObservation,
  type PaymentRequiredObservation,
} from "./payment-observation.js";
import {
  commitHttpRequest,
  type HttpRequestBindingInput,
  type HttpRequestCommitment,
} from "./request-binding.js";

export const MAX_HUMAN_PAYMENT_FETCH_MS = 10_000;

type ObservationState = Readonly<{
  binding: HttpRequestCommitment;
  paymentObservation: PaymentRequiredObservation;
}>;

const observations = new WeakMap<object, ObservationState>();

function requestSnapshot(input: HttpRequestBindingInput) {
  const binding = commitHttpRequest(input);
  const body =
    input.body === undefined ? undefined : Uint8Array.from(input.body);
  const headers = Object.freeze(
    (input.headers ?? []).map(([name, value]) =>
      Object.freeze([name, value] as const),
    ),
  );
  const additionalAuthoritativeHeaders = Object.freeze([
    ...(input.additionalAuthoritativeHeaders ?? []),
  ]);
  return {
    binding: Object.freeze({
      ...binding,
      canonicalBytes: Uint8Array.from(binding.canonicalBytes),
    }),
    body,
    headers,
    additionalAuthoritativeHeaders,
    method: input.method.toUpperCase(),
    url: new URL(input.url).toString(),
  };
}

function optionsSignal(options: HumanPaymentObservationOptions): AbortSignal {
  const timeout = options.timeoutMilliseconds ?? MAX_HUMAN_PAYMENT_FETCH_MS;
  if (
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > MAX_HUMAN_PAYMENT_FETCH_MS
  ) {
    throw new Error("human payment fetch timeout must be 1-10000ms");
  }
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new Error("human payment fetch signal is invalid");
  }
  const timeoutSignal = AbortSignal.timeout(timeout);
  return options.signal === undefined
    ? timeoutSignal
    : AbortSignal.any([options.signal, timeoutSignal]);
}

function fetchResponse(
  fetchAuthorized: HumanPaymentFetcher,
  request: HumanPaymentFetchRequest,
  callerSignal: AbortSignal | undefined,
): Promise<Pick<Response, "headers" | "status">> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() =>
        reject(
          new Error(
            callerSignal?.aborted === true
              ? "human payment fetch cancelled"
              : "human payment fetch deadline exceeded",
          ),
        ),
      );
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) return onAbort();
    try {
      void fetchAuthorized(request).then(
        (response) => finish(() => resolve(response)),
        () => finish(() => reject(new Error("human payment fetch failed"))),
      );
    } catch {
      finish(() => reject(new Error("human payment fetch failed")));
    }
  });
}

export function createHumanPaymentObserver(
  fetchAuthorized: HumanPaymentFetcher,
): HumanPaymentObserver {
  if (typeof fetchAuthorized !== "function") {
    throw new Error("human payment trusted fetcher is required");
  }
  return async (input, options = {}) => {
    const snapshot = requestSnapshot(input);
    const signal = optionsSignal(options);
    const request = Object.freeze({
      ...(snapshot.body === undefined
        ? {}
        : { body: Uint8Array.from(snapshot.body) }),
      headers: snapshot.headers,
      method: snapshot.method,
      redirect: "error" as const,
      signal,
      url: snapshot.url,
    });
    const response = await fetchResponse(
      fetchAuthorized,
      request,
      options.signal,
    );
    const paymentObservation = capturePaymentRequiredResponse(response);
    const observation = Object.freeze({
      challengeId: paymentObservation.challengeId,
      observationId: `sha256:${randomBytes(32).toString("hex")}` as const,
      observedAt: paymentObservation.observedAt,
      requestCommitment: snapshot.binding.commitment,
    });
    observations.set(observation, {
      binding: snapshot.binding,
      paymentObservation,
    });
    return observation;
  };
}

/** @internal Human purchase construction only. */
export function readHumanPaymentAuthority(
  candidate: unknown,
): HumanPaymentAuthority {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human payment observation is not authenticated");
  }
  const state = observations.get(candidate);
  if (state === undefined) {
    throw new Error("human payment observation is not authenticated");
  }
  readPaymentRequiredObservation(state.paymentObservation);
  return Object.freeze({
    binding: Object.freeze({
      ...state.binding,
      canonicalBytes: Uint8Array.from(state.binding.canonicalBytes),
    }),
    paymentObservation: state.paymentObservation,
  });
}

export type {
  HumanPaymentFetcher,
  HumanPaymentFetchRequest,
  HumanPaymentObservation,
  HumanPaymentObservationOptions,
  HumanPaymentObserver,
} from "./human-payment-observation-types.js";
