import { randomUUID } from "node:crypto";
import { claimVerifiedHumanWalletSigningSession } from "@sotto/x402-canton/internal/human-wallet-signing-session";
import type { SpikeConfig } from "./config.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import { readFiveNorthResponse } from "./five-north-response.js";
import {
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
} from "./five-north-token.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;
type PersistExecutionStarted = (
  value: Readonly<{
    sessionId: `sha256:${string}`;
    submissionId: string;
    userId: string;
  }>,
) => Promise<void>;

export const HUMAN_WALLET_EXECUTE_TIMEOUT_MS = 10_000;
export const MAX_HUMAN_WALLET_EXECUTE_REQUEST_BYTES = 3_145_728;
export const MAX_HUMAN_WALLET_EXECUTE_RESPONSE_BYTES = 2_097_152;
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

function requestSource(
  material: ReturnType<typeof claimVerifiedHumanWalletSigningSession>,
  submissionId: string,
  userId: string,
): string {
  const source = JSON.stringify({
    preparedTransaction: Buffer.from(material.preparedTransaction).toString(
      "base64",
    ),
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    userId,
    submissionId,
    deduplicationPeriod: { Empty: {} },
    partySignatures: {
      signatures: [
        {
          party: material.signature.party,
          signatures: [
            {
              format: material.signature.signatureFormat,
              signature: material.signature.signature,
              signingAlgorithmSpec: material.signature.signingAlgorithm,
              signedBy: material.signature.signedBy,
            },
          ],
        },
      ],
    },
  });
  if (
    new TextEncoder().encode(source).byteLength >
    MAX_HUMAN_WALLET_EXECUTE_REQUEST_BYTES
  ) {
    throw new Error("human wallet execute request exceeds byte limit");
  }
  return source;
}

async function discardBounded(response: Response): Promise<void> {
  try {
    await readFiveNorthResponse(
      response,
      MAX_HUMAN_WALLET_EXECUTE_RESPONSE_BYTES,
    );
  } catch {
    // The caller receives status-only errors.
  }
}

export function createFiveNorthHumanWalletExecuteTransport(
  candidateNetwork: SpikeConfig["network"],
  candidateOptions: Options,
) {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const options = requireOptions(candidateOptions);
  const fetcher = options.fetcher ?? fetch;
  const tokens = createFiveNorthTokenProvider(network, fetcher, options.signal);
  let claimed = false;

  async function send(source: string, token: string): Promise<Response> {
    try {
      return await fetcher(`${network.ledgerUrl}${EXECUTE_PATH}`, {
        body: source,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.any([
          options.signal,
          AbortSignal.timeout(HUMAN_WALLET_EXECUTE_TIMEOUT_MS),
        ]),
      });
    } catch {
      throw new Error("Five North human wallet execute transport failed");
    }
  }

  return Object.freeze({
    execute: async (
      verified: unknown,
      persistExecutionStarted: PersistExecutionStarted,
    ) => {
      if (claimed) throw new Error("human wallet execute is already claimed");
      if (typeof persistExecutionStarted !== "function") {
        throw new Error("human wallet execute start persistence is required");
      }
      const material = claimVerifiedHumanWalletSigningSession(verified);
      claimed = true;
      let token: string;
      let userId: string;
      try {
        token = await tokens.accessToken();
        userId = readFiveNorthAccessTokenSubject(token);
      } catch {
        throw new Error(
          "Five North human wallet execute token acquisition failed",
        );
      }
      const submissionId = randomUUID();
      const source = requestSource(material, submissionId, userId);
      try {
        await persistExecutionStarted(
          Object.freeze({
            sessionId: material.sessionId,
            submissionId,
            userId,
          }),
        );
      } catch {
        throw new Error("human wallet execute start persistence failed");
      }
      const response = await send(source, token);
      if (!response.ok) {
        const status = response.status;
        await discardBounded(response);
        throw new Error(
          `Five North human wallet execute failed with HTTP ${status}`,
        );
      }
      try {
        await readFiveNorthResponse(
          response,
          MAX_HUMAN_WALLET_EXECUTE_RESPONSE_BYTES,
        );
      } catch {
        throw new Error("Five North human wallet execute response is invalid");
      }
      return Object.freeze({
        outcome: "submitted" as const,
        preparedTransactionHash: material.preparedTransactionHash,
        sessionId: material.sessionId,
        submissionId,
        userId,
      });
    },
  });
}
