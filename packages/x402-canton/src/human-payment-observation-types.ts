import type { PaymentRequiredObservation } from "./payment-observation.js";
import type {
  HttpRequestBindingInput,
  HttpRequestCommitment,
} from "./request-binding.js";

export type HumanPaymentFetchRequest = Readonly<{
  body?: Uint8Array;
  headers: ReadonlyArray<readonly [string, string]>;
  method: string;
  redirect: "error";
  signal: AbortSignal;
  url: string;
}>;

export type HumanPaymentFetcher = (
  request: HumanPaymentFetchRequest,
) => Promise<Pick<Response, "headers" | "status">>;

export type HumanPaymentObservationOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}>;

export type HumanPaymentObservation = Readonly<{
  challengeId: `sha256:${string}`;
  observationId: `sha256:${string}`;
  observedAt: string;
  requestCommitment: `sha256:${string}`;
}>;

export type HumanPaymentObserver = (
  request: HttpRequestBindingInput,
  options?: HumanPaymentObservationOptions,
) => Promise<HumanPaymentObservation>;

export type HumanPaymentAuthority = Readonly<{
  binding: HttpRequestCommitment;
  paymentObservation: PaymentRequiredObservation;
}>;
