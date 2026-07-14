import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const TRANSACTION_RESPONSE_LIMIT = 2_000_000;
const TRANSACTION_REQUEST_LIMIT = 65_536;
const DEFINITIVE_BAD_REQUEST_PATTERN =
  /^Five North request failed with HTTP 400(?: \([A-Z][A-Z0-9_.-]{0,63}\))?$/u;

export class AmbiguousTransactionSubmissionError extends Error {
  override readonly name = "AmbiguousTransactionSubmissionError";

  constructor() {
    super("Five North transaction submission outcome is ambiguous");
  }
}

export function createFiveNorthTransactionSubmitter(input: {
  readonly accessToken: () => Promise<string>;
  readonly fetcher: Fetcher;
  readonly ledgerUrl: string;
  readonly result: "completion" | "transaction";
}) {
  return async (body: unknown): Promise<unknown> => {
    const source = JSON.stringify(
      input.result === "transaction" ? { commands: body } : body,
    );
    if (
      new TextEncoder().encode(source).byteLength > TRANSACTION_REQUEST_LIMIT
    ) {
      throw new Error("Five North transaction request exceeds byte limit");
    }
    const token = await input.accessToken();
    let response: Response;
    try {
      response = await input.fetcher(
        `${input.ledgerUrl}/v2/commands/${
          input.result === "transaction"
            ? "submit-and-wait-for-transaction"
            : "submit-and-wait"
        }`,
        {
          body: source,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      throw new AmbiguousTransactionSubmissionError();
    }
    if (!response.ok) {
      try {
        await readFiveNorthResponse(response, TRANSACTION_RESPONSE_LIMIT);
      } catch (error) {
        if (
          response.status === 400 &&
          error instanceof Error &&
          DEFINITIVE_BAD_REQUEST_PATTERN.test(error.message)
        ) {
          throw error;
        }
        throw new AmbiguousTransactionSubmissionError();
      }
      throw new AmbiguousTransactionSubmissionError();
    }
    try {
      return parseFiveNorthJson(
        await readFiveNorthResponse(response, TRANSACTION_RESPONSE_LIMIT),
        "Five North transaction response",
      );
    } catch {
      throw new AmbiguousTransactionSubmissionError();
    }
  };
}
