import type {
  PackagePreferenceReader,
  PackagePreferenceReadRequest,
} from "@sotto/x402-canton";
import type { SpikeConfig } from "./config.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import { parseFiveNorthPackagePreferenceResponse } from "./five-north-package-preference-response.js";
import { buildFiveNorthPackagePreferenceBody } from "./five-north-package-preference-validation.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import {
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
} from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;
const PREFERENCE_PATH = "/v2/interactive-submission/preferred-packages";
const PREFERENCE_TIMEOUT_MS = 10_000;
const PREFERENCE_RESPONSE_LIMIT = 65_536;

export function createFiveNorthPackagePreferenceReader(
  candidateNetwork: SpikeConfig["network"],
  options: Options,
): PackagePreferenceReader {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const fetcher = options.fetcher ?? fetch;
  const scopeSignal = options.signal;
  if (!(scopeSignal instanceof AbortSignal)) {
    throw new Error("Five North package preference requires an AbortSignal");
  }
  const tokens = createFiveNorthTokenProvider(network, fetcher, scopeSignal);
  let authenticatedSubject: string | undefined;

  function requireActive(): void {
    if (scopeSignal.aborted) {
      throw new Error("Five North package preference scope cancelled");
    }
  }

  async function authenticatedToken(): Promise<
    Readonly<{ subject: string; token: string }>
  > {
    requireActive();
    const token = await tokens.accessToken();
    requireActive();
    const subject = readFiveNorthAccessTokenSubject(token);
    authenticatedSubject ??= subject;
    if (subject !== authenticatedSubject) {
      throw new Error("Five North access token subject changed");
    }
    return Object.freeze({ subject, token });
  }

  async function readPackageReferences(
    candidate: PackagePreferenceReadRequest,
  ): Promise<unknown> {
    const request = buildFiveNorthPackagePreferenceBody(candidate);
    const { token } = await authenticatedToken();
    requireActive();
    let response: Response;
    try {
      response = await fetcher(`${network.ledgerUrl}${PREFERENCE_PATH}`, {
        body: request.body,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([
          scopeSignal,
          AbortSignal.timeout(PREFERENCE_TIMEOUT_MS),
        ]),
      });
    } catch {
      requireActive();
      throw new Error("Five North package preference transport failed");
    }
    if (scopeSignal.aborted) {
      await response.body?.cancel().catch(() => undefined);
      requireActive();
    }
    const bytes = await readFiveNorthResponse(
      response,
      PREFERENCE_RESPONSE_LIMIT,
    );
    const mediaType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]!
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json" && !mediaType.endsWith("+json")) {
      throw new Error("Five North package preference response is not JSON");
    }
    requireActive();
    return parseFiveNorthPackagePreferenceResponse(
      parseFiveNorthJson(bytes, "Five North package preference response"),
      request.synchronizerId,
    );
  }

  return Object.freeze({
    readAuthenticatedSubject: async () => (await authenticatedToken()).subject,
    readPackageReferences,
  });
}
