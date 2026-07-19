import type { claimVerifiedHumanWalletSigningSession } from "@sotto/x402-canton/internal/human-wallet-signing-session";
import { readFiveNorthResponse } from "./five-north-response.js";

export const MAX_HUMAN_WALLET_EXECUTE_REQUEST_BYTES = 3_145_728;
export const MAX_HUMAN_WALLET_EXECUTE_RESPONSE_BYTES = 2_097_152;

export function humanWalletExecuteRequestSource(
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

export async function requireHumanWalletExecuteResponse(
  response: Response,
): Promise<void> {
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
}
