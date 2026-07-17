import type { SpikeConfig } from "./config.js";
import { readinessParty } from "./five-north-capability-readiness-validation.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import { createFiveNorthTokenProvider } from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;

const TRANSACTION_PATH = "/v2/updates/transaction-by-id";
const TRANSACTION_TIMEOUT_MS = 10_000;
const TRANSACTION_RESPONSE_LIMIT = 2_000_000;
const UPDATE_ID = /^1220[0-9a-f]{64}$/u;

export function createFiveNorthHumanProviderTransactionReader(
  candidateNetwork: SpikeConfig["network"],
  candidateProviderParty: string,
  options: Options,
): (updateId: string) => Promise<unknown> {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const providerParty = readinessParty(
    candidateProviderParty,
    "human provider",
    true,
  );
  if (!(options.signal instanceof AbortSignal)) {
    throw new Error("human provider transaction requires an AbortSignal");
  }
  if (options.fetcher !== undefined && typeof options.fetcher !== "function") {
    throw new Error("human provider transaction fetcher is invalid");
  }
  const fetcher = options.fetcher ?? fetch;
  const tokens = createFiveNorthTokenProvider(network, fetcher, options.signal);

  return async (updateId: string): Promise<unknown> => {
    if (!UPDATE_ID.test(updateId)) {
      throw new Error("human provider transaction update ID is invalid");
    }
    if (options.signal.aborted) {
      throw new Error("human provider transaction was cancelled");
    }
    const token = await tokens.accessToken();
    let response: Response;
    try {
      response = await fetcher(`${network.ledgerUrl}${TRANSACTION_PATH}`, {
        body: JSON.stringify({
          updateId,
          transactionFormat: {
            eventFormat: {
              filtersByParty: {
                [providerParty]: {
                  cumulative: [
                    {
                      identifierFilter: {
                        WildcardFilter: {
                          value: { includeCreatedEventBlob: false },
                        },
                      },
                    },
                  ],
                },
              },
              verbose: false,
            },
            transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
          },
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([
          options.signal,
          AbortSignal.timeout(TRANSACTION_TIMEOUT_MS),
        ]),
      });
    } catch {
      throw new Error("human provider transaction transport failed");
    }
    return parseFiveNorthJson(
      await readFiveNorthResponse(response, TRANSACTION_RESPONSE_LIMIT),
      "Five North human provider transaction",
    );
  };
}
