import type {
  NonX402ProbeResult,
  VerifiedX402ProbeResult,
} from "@sotto/database";
import { inspectCatalogPaymentRequiredResponse } from "@sotto/x402-canton";
import type { CatalogProbeInput } from "./catalog-probe-types.js";

function nonX402(reason: NonX402ProbeResult["reason"]): NonX402ProbeResult {
  return Object.freeze({ kind: "non-x402", reason });
}

export function deriveCatalogProbeResult(
  response: Response,
  input: CatalogProbeInput,
  url: string,
  expectedNetwork: `canton:${string}`,
): Readonly<{
  observedAt: string;
  result: VerifiedX402ProbeResult | NonX402ProbeResult;
}> {
  if (response.status === 200) {
    return Object.freeze({
      observedAt: new Date().toISOString(),
      result: nonX402("HTTP_200"),
    });
  }
  if (response.headers.get("PAYMENT-REQUIRED") === null) {
    return Object.freeze({
      observedAt: new Date().toISOString(),
      result: nonX402("MISSING_PAYMENT_REQUIRED"),
    });
  }
  try {
    const payment = inspectCatalogPaymentRequiredResponse(response, {
      expectedNetwork,
      expectedResourceUrl: url,
    });
    return Object.freeze({
      observedAt: payment.observedAt,
      result: Object.freeze({
        kind: "verified-x402",
        revisionId: input.revisionId,
        name: input.name,
        description: input.description,
        challengeHash: payment.challengeHash,
        x402Version: 2,
        scheme: "exact",
        network: payment.network,
        asset: payment.asset,
        recipient: payment.recipient,
        amountAtomic: payment.amountAtomic,
        transferMethod: "transfer-factory",
      }),
    });
  } catch {
    return Object.freeze({
      observedAt: new Date().toISOString(),
      result: nonX402("UNSUPPORTED_REQUIREMENT"),
    });
  }
}
