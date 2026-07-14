import type { CapabilityBootstrapCompletionQuery } from "./capability-bootstrap-completion.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import {
  readFiveNorthAccessTokenSubject,
  type FiveNorthTokenProvider,
} from "./five-north-token.js";

const COMPLETION_RESPONSE_LIMIT = 2_000_000;
const COMPLETION_TIMEOUT_MS = 10_000;
export const CAPABILITY_COMPLETION_QUERY =
  "/v2/commands/completions?limit=1000&stream_idle_timeout_ms=250";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

function exactQuery(
  value: CapabilityBootstrapCompletionQuery,
  payerParty: string,
): void {
  if (
    typeof value !== "object" ||
    value === null ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(["beginExclusive", "limit", "parties", "userId"].sort()) ||
    !Number.isSafeInteger(value.beginExclusive) ||
    value.beginExclusive < 0 ||
    value.limit !== 1_000 ||
    JSON.stringify(value.parties) !== JSON.stringify([payerParty]) ||
    typeof value.userId !== "string" ||
    value.userId === "" ||
    value.userId.trim() !== value.userId ||
    new TextEncoder().encode(value.userId).byteLength > 255
  ) {
    throw new Error("capability completion query is invalid");
  }
}

export function createFiveNorthCapabilityCompletionPageReader(input: {
  fetcher: Fetcher;
  ledgerUrl: string;
  payerParty: string;
  signal: AbortSignal;
  tokenProvider: FiveNorthTokenProvider;
}) {
  return async (
    query: CapabilityBootstrapCompletionQuery,
  ): Promise<unknown> => {
    exactQuery(query, input.payerParty);
    if (input.signal.aborted) {
      throw new Error("Five North capability completion scope cancelled");
    }
    const token = await input.tokenProvider.accessToken();
    if (readFiveNorthAccessTokenSubject(token) !== query.userId) {
      throw new Error("capability completion token subject does not match");
    }
    const response = await input.fetcher(
      `${input.ledgerUrl}${CAPABILITY_COMPLETION_QUERY}`,
      {
        body: JSON.stringify({
          beginExclusive: query.beginExclusive,
          parties: query.parties,
          userId: query.userId,
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([
          input.signal,
          AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
        ]),
      },
    );
    return parseFiveNorthJson(
      await readFiveNorthResponse(response, COMPLETION_RESPONSE_LIMIT),
      "Five North completion response",
    );
  };
}
