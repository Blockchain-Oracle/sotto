import type {
  HumanPaymentFetcher,
  HumanPaymentFetchRequest,
} from "@sotto/x402-canton";
import type { PinnedCloudflarePaidRequest } from "./cloudflare-pinned-paid-fetch.js";
import { encodeSettlementProof, type SettlementProof } from "./provider.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type PaidFetcher = (
  url: string,
  request: PinnedCloudflarePaidRequest,
) => Promise<Response>;

function active(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Five North human provider session cancelled");
  }
}

export function createUnsignedHumanProviderFetcher(
  fetcher: Fetcher,
  resourceUrl: string,
): HumanPaymentFetcher {
  return async (request: HumanPaymentFetchRequest) => {
    if (
      request.url !== resourceUrl ||
      request.method !== "GET" ||
      request.redirect !== "error" ||
      !(request.signal instanceof AbortSignal) ||
      "body" in request ||
      !Array.isArray(request.headers) ||
      request.headers.length !== 0
    ) {
      throw new Error(
        "read-only human provider request forbids signatures and headers",
      );
    }
    active(request.signal);
    return await fetcher(resourceUrl, {
      headers: new Headers(),
      method: "GET",
      redirect: "error",
      signal: request.signal,
    });
  };
}

export function createPaidHumanProviderRetry(
  fetcher: PaidFetcher,
  resourceUrl: string,
  signal: AbortSignal,
): (proof: SettlementProof) => Promise<Response> {
  let boundPaymentSignature: string | undefined;
  return async (proof) => {
    const paymentSignature = encodeSettlementProof(proof);
    active(signal);
    if (
      boundPaymentSignature !== undefined &&
      boundPaymentSignature !== paymentSignature
    ) {
      throw new Error("human provider paid retry cannot use a different proof");
    }
    boundPaymentSignature = paymentSignature;
    const response = await fetcher(resourceUrl, {
      headers: [["PAYMENT-SIGNATURE", paymentSignature]],
      method: "GET",
      redirect: "error",
      signal,
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("human provider paid retry requires HTTP 200");
    }
    return response;
  };
}
