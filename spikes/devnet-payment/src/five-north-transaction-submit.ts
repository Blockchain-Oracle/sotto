import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const TRANSACTION_RESPONSE_LIMIT = 2_000_000;
const TRANSACTION_REQUEST_LIMIT = 65_536;
const DEFINITIVE_BAD_REQUEST_PATTERN =
  /^Five North request failed with HTTP 400(?: \([A-Z][A-Z0-9_.-]{0,63}\))?$/u;
const BOUNDED_HTTP_REJECTION_PATTERN =
  /^Five North request failed with HTTP \d{3}(?: \([A-Z][A-Z0-9_.-]{0,63}\))?$/u;

export type AmbiguousTransactionSubmissionReason =
  | "HTTP_CLIENT_ERROR"
  | "HTTP_RETRYABLE"
  | "HTTP_SERVER_ERROR"
  | "RESPONSE_UNREADABLE"
  | "SUCCESS_RESPONSE_INVALID"
  | "TRANSPORT"
  | "UNKNOWN";

export class AmbiguousTransactionSubmissionError extends Error {
  override readonly name = "AmbiguousTransactionSubmissionError";

  constructor(
    readonly reason: AmbiguousTransactionSubmissionReason = "UNKNOWN",
    readonly statusCode?: number,
  ) {
    super("Five North transaction submission outcome is ambiguous");
    if (
      statusCode !== undefined &&
      (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)
    ) {
      throw new Error("Five North ambiguity status code is invalid");
    }
  }
}

function httpAmbiguityReason(
  status: number,
): AmbiguousTransactionSubmissionReason {
  if (status === 408 || status === 429) return "HTTP_RETRYABLE";
  if (status >= 500) return "HTTP_SERVER_ERROR";
  return "HTTP_CLIENT_ERROR";
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
      throw new AmbiguousTransactionSubmissionError("TRANSPORT");
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
        throw new AmbiguousTransactionSubmissionError(
          error instanceof Error &&
            BOUNDED_HTTP_REJECTION_PATTERN.test(error.message)
            ? httpAmbiguityReason(response.status)
            : "RESPONSE_UNREADABLE",
          response.status,
        );
      }
      throw new AmbiguousTransactionSubmissionError(
        httpAmbiguityReason(response.status),
        response.status,
      );
    }
    try {
      return parseFiveNorthJson(
        await readFiveNorthResponse(response, TRANSACTION_RESPONSE_LIMIT),
        "Five North transaction response",
      );
    } catch {
      throw new AmbiguousTransactionSubmissionError(
        "SUCCESS_RESPONSE_INVALID",
        response.status,
      );
    }
  };
}
