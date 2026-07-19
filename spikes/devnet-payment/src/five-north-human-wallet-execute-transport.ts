import { randomUUID } from "node:crypto";
import { claimVerifiedHumanWalletSigningSession } from "@sotto/x402-canton/internal/human-wallet-signing-session";
import type { SpikeConfig } from "./config.js";
import {
  FIVE_NORTH_HUMAN_WALLET_PREFLIGHT_TIMEOUT_MS,
  withFiveNorthHumanWalletDeadline,
} from "./five-north-human-wallet-deadline.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  humanWalletExecuteRequestSource,
  requireHumanWalletExecuteResponse,
} from "./five-north-human-wallet-execute-request.js";
import {
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
} from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;
type DispatchOptions = Readonly<{ signal?: AbortSignal }>;

export const HUMAN_WALLET_EXECUTE_TIMEOUT_MS =
  FIVE_NORTH_HUMAN_WALLET_PREFLIGHT_TIMEOUT_MS;
export {
  MAX_HUMAN_WALLET_EXECUTE_REQUEST_BYTES,
  MAX_HUMAN_WALLET_EXECUTE_RESPONSE_BYTES,
} from "./five-north-human-wallet-execute-request.js";
const EXECUTE_PATH = "/v2/interactive-submission/execute";

function requireOptions(candidate: Options): Options {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.keys(candidate).some((key) => key !== "fetcher" && key !== "signal")
  ) {
    throw new Error("human wallet execute options fields do not match");
  }
  if (!(candidate.signal instanceof AbortSignal)) {
    throw new Error("human wallet execute requires an AbortSignal");
  }
  if (
    candidate.fetcher !== undefined &&
    typeof candidate.fetcher !== "function"
  ) {
    throw new Error("human wallet execute fetcher is invalid");
  }
  return candidate;
}

function requireDispatchOptions(candidate: DispatchOptions): DispatchOptions {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.keys(candidate).some((key) => key !== "signal") ||
    (candidate.signal !== undefined &&
      !(candidate.signal instanceof AbortSignal))
  ) {
    throw new Error("human wallet execute dispatch options are invalid");
  }
  return candidate;
}

function scopedSignal(
  scope: AbortSignal,
  candidate: DispatchOptions,
): AbortSignal {
  return candidate.signal === undefined
    ? scope
    : AbortSignal.any([scope, candidate.signal]);
}

export function createFiveNorthHumanWalletExecuteTransport(
  candidateNetwork: SpikeConfig["network"],
  candidateOptions: Options,
) {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const options = requireOptions(candidateOptions);
  const fetcher = options.fetcher ?? fetch;

  async function send(
    source: string,
    token: string,
    signal: AbortSignal,
  ): Promise<Response> {
    try {
      return await withFiveNorthHumanWalletDeadline(
        signal,
        async (bounded) =>
          await fetcher(`${network.ledgerUrl}${EXECUTE_PATH}`, {
            body: source,
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            method: "POST",
            redirect: "error",
            signal: bounded,
          }),
      );
    } catch {
      throw new Error("Five North human wallet execute transport failed");
    }
  }

  return Object.freeze({
    createDispatch: async (
      verified: unknown,
      candidateDispatchOptions: DispatchOptions,
    ) => {
      const dispatchOptions = requireDispatchOptions(candidateDispatchOptions);
      const scope = scopedSignal(options.signal, dispatchOptions);
      const material = claimVerifiedHumanWalletSigningSession(verified);
      let token: string;
      let userId: string;
      try {
        ({ token, userId } = await withFiveNorthHumanWalletDeadline(
          scope,
          async (bounded) => {
            const tokens = createFiveNorthTokenProvider(
              network,
              fetcher,
              bounded,
            );
            const value = await tokens.accessToken();
            return {
              token: value,
              userId: readFiveNorthAccessTokenSubject(value),
            };
          },
        ));
      } catch {
        throw new Error(
          "Five North human wallet execute token acquisition failed",
        );
      }
      const submissionId = randomUUID();
      const source = humanWalletExecuteRequestSource(
        material,
        submissionId,
        userId,
      );
      const preparedTransactionHash = material.preparedTransactionHash;
      const sessionId = material.sessionId;
      return Object.freeze({
        preparedTransactionHash,
        sessionId,
        submissionId,
        userId,
        execute: (() => {
          let executed = false;
          return async (candidateExecuteOptions: DispatchOptions) => {
            const executeOptions = requireDispatchOptions(
              candidateExecuteOptions,
            );
            if (executed) {
              throw new Error(
                "human wallet execute dispatch is already claimed",
              );
            }
            executed = true;
            const response = await send(
              source,
              token,
              scopedSignal(scope, executeOptions),
            );
            await requireHumanWalletExecuteResponse(response);
            return Object.freeze({
              outcome: "submitted" as const,
              preparedTransactionHash,
            });
          };
        })(),
      });
    },
  });
}
