import { randomUUID } from "node:crypto";
import { claimVerifiedCapabilityWalletSignature } from "@sotto/x402-canton/internal/capability-wallet-signature";
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

export const CAPABILITY_EXECUTE_TIMEOUT_MS = 10_000;
export const MAX_CAPABILITY_EXECUTE_REQUEST_BYTES = 2_097_152;
export const MAX_CAPABILITY_EXECUTE_RESPONSE_BYTES = 2_097_152;
const EXECUTE_PATH = "/v2/interactive-submission/execute";

function requireOptions(candidate: Options): Options {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.keys(candidate).some((key) => key !== "fetcher" && key !== "signal")
  ) {
    throw new Error("capability execute options fields do not match");
  }
  if (!(candidate.signal instanceof AbortSignal)) {
    throw new Error("capability execute requires an AbortSignal");
  }
  if (
    candidate.fetcher !== undefined &&
    typeof candidate.fetcher !== "function"
  ) {
    throw new Error("capability execute fetcher is invalid");
  }
  return candidate;
}

function requestSource(
  material: ReturnType<typeof claimVerifiedCapabilityWalletSignature>,
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
          party: material.party,
          signatures: [
            {
              format: material.signatureFormat,
              signature: material.signature,
              signingAlgorithmSpec: material.signingAlgorithm,
              signedBy: material.signedBy,
            },
          ],
        },
      ],
    },
  });
  if (
    new TextEncoder().encode(source).byteLength >
    MAX_CAPABILITY_EXECUTE_REQUEST_BYTES
  ) {
    throw new Error("capability execute request exceeds byte limit");
  }
  return source;
}

async function discardBounded(response: Response): Promise<void> {
  try {
    await readFiveNorthResponse(
      response,
      MAX_CAPABILITY_EXECUTE_RESPONSE_BYTES,
    );
  } catch {
    // The caller receives status-only errors.
  }
}

export function createFiveNorthCapabilityExecuteTransport(
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
          AbortSignal.timeout(CAPABILITY_EXECUTE_TIMEOUT_MS),
        ]),
      });
    } catch {
      throw new Error("Five North capability execute transport failed");
    }
  }

  return Object.freeze({
    execute: async (
      verified: unknown,
      persistExecutionStarted: PersistExecutionStarted,
    ) => {
      if (claimed) throw new Error("capability execute is already claimed");
      if (typeof persistExecutionStarted !== "function") {
        throw new Error("capability execute start persistence is required");
      }
      const material = claimVerifiedCapabilityWalletSignature(verified);
      claimed = true;
      let token = await tokens.accessToken();
      const userId = readFiveNorthAccessTokenSubject(token);
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
        throw new Error("capability execute start persistence failed");
      }
      let response = await send(source, token);
      if (response.status === 401) {
        await discardBounded(response);
        tokens.invalidate();
        token = await tokens.accessToken();
        if (readFiveNorthAccessTokenSubject(token) !== userId) {
          throw new Error("capability execute token subject changed");
        }
        response = await send(source, token);
      }
      if (!response.ok) {
        const status = response.status;
        await discardBounded(response);
        throw new Error(
          `Five North capability execute failed with HTTP ${status}`,
        );
      }
      try {
        await readFiveNorthResponse(
          response,
          MAX_CAPABILITY_EXECUTE_RESPONSE_BYTES,
        );
      } catch {
        throw new Error("Five North capability execute response is invalid");
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
