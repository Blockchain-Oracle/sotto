import type { SpikeConfig } from "./config.js";
import type { FiveNorthCapabilityReadinessReader } from "./five-north-capability-readiness.js";
import {
  approveFiveNorthPrepareNetwork,
  type ApprovedFiveNorthPrepareNetwork,
} from "./five-north-prepare-network.js";
import {
  boundedPrepareBody,
  preferredSottoPackageBody,
} from "./five-north-prepare-requests.js";
import {
  MAX_LEDGER_PACKAGE_BYTES,
  requireLedgerPackageId,
  verifyLedgerPackagePresence,
} from "./five-north-package-presence.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import {
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
  type FiveNorthTokenProvider,
} from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{
  fetcher?: Fetcher;
  signal: AbortSignal;
  tokenProvider?: FiveNorthTokenProvider;
}>;
const JSON_RESPONSE_LIMIT = 2_000_000;

export function createFiveNorthCapabilityReadinessTransport(
  candidateNetwork: SpikeConfig["network"],
  options: Options,
): FiveNorthCapabilityReadinessReader {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const fetcher = options.fetcher ?? fetch;
  const scopeSignal = options.signal;
  if (!(scopeSignal instanceof AbortSignal)) {
    throw new Error("Five North authority scope requires an AbortSignal");
  }
  const tokens =
    options.tokenProvider ??
    createFiveNorthTokenProvider(network, fetcher, scopeSignal);

  function requireActive(): void {
    if (scopeSignal.aborted) {
      throw new Error("Five North authority scope cancelled");
    }
  }

  async function authorizedResponse(
    url: string,
    init: Omit<RequestInit, "headers" | "signal"> & {
      headers?: HeadersInit;
    },
  ): Promise<Response> {
    async function send(): Promise<Response> {
      requireActive();
      const token = await tokens.accessToken();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      return fetcher(url, {
        ...init,
        headers,
        signal: AbortSignal.any([scopeSignal, AbortSignal.timeout(30_000)]),
      });
    }
    let response = await send();
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      tokens.invalidate();
      response = await send();
    }
    requireActive();
    return response;
  }

  async function ledgerJson(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<unknown> {
    const response = await authorizedResponse(`${network.ledgerUrl}${path}`, {
      ...(body === undefined
        ? {}
        : {
            body: boundedPrepareBody(body, "authority Ledger request"),
            headers: { "content-type": "application/json" },
          }),
      method,
      redirect: "error",
    });
    return parseFiveNorthJson(
      await readFiveNorthResponse(response, JSON_RESPONSE_LIMIT),
      "Five North authority response",
    );
  }

  async function validatorJson(
    networkValue: ApprovedFiveNorthPrepareNetwork,
  ): Promise<unknown> {
    return parseFiveNorthJson(
      await readFiveNorthResponse(
        await authorizedResponse(
          `${networkValue.validatorUrl}/v0/scan-proxy/amulet-rules`,
          { method: "GET", redirect: "error" },
        ),
        JSON_RESPONSE_LIMIT,
      ),
      "Five North authority response",
    );
  }

  return Object.freeze({
    readAmuletRules: () => validatorJson(network),
    readAuthenticatedUserId: async () =>
      readFiveNorthAccessTokenSubject(await tokens.accessToken()),
    readPackagePresence: async (candidatePackageId) => {
      const packageId = requireLedgerPackageId(candidatePackageId);
      const response = await authorizedResponse(
        `${network.ledgerUrl}/v2/packages/${packageId}`,
        { method: "GET", redirect: "error" },
      );
      const bytes = await readFiveNorthResponse(
        response,
        MAX_LEDGER_PACKAGE_BYTES,
      );
      if (response.headers.get("canton-package-hash") !== packageId) {
        throw new Error("Ledger package hash header does not match package ID");
      }
      return verifyLedgerPackagePresence(bytes, packageId);
    },
    readPreferredSottoPackage: (payerParty, agentParty) =>
      ledgerJson(
        "/v2/interactive-submission/preferred-packages",
        "POST",
        preferredSottoPackageBody(payerParty, agentParty),
      ),
  });
}
