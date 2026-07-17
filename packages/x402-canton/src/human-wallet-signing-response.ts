import {
  capabilityWalletSignatureFormat,
  capabilityWalletSigningAlgorithm,
  isSupportedCapabilityWalletSignatureScheme,
} from "./capability-wallet-signature-scheme.js";
import { cantonFingerprint } from "./capability-wallet-signature-validation.js";
import {
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
  type HumanWalletSignatureEnvelope,
} from "./human-wallet-signing-types.js";
import { identifier } from "./purchase-commitment-primitives.js";
import {
  exactWalletDataRecord,
  optionalWalletDataRecord,
} from "./wallet-data-record.js";

type ExpectedResponse = Readonly<{
  preparedTransactionHash: `sha256:${string}`;
  sessionId: `sha256:${string}`;
}>;

export function parseHumanWalletSigningResponse(
  value: unknown,
  expected: ExpectedResponse,
):
  | Readonly<{ outcome: "rejected"; reason: "user-rejected" }>
  | Readonly<{ outcome: "approved"; signature: HumanWalletSignatureEnvelope }> {
  let candidate: Readonly<Record<string, unknown>>;
  try {
    candidate = optionalWalletDataRecord(
      value,
      [
        "outcome",
        "preparedTransactionHash",
        "reason",
        "sessionId",
        "signature",
        "version",
      ],
      "human wallet approval response",
    );
  } catch {
    throw new Error("human wallet approval response is invalid");
  }
  const rejected = candidate.outcome === "rejected";
  const record = exactWalletDataRecord(
    candidate,
    rejected
      ? ["outcome", "reason", "sessionId", "version"]
      : [
          "outcome",
          "preparedTransactionHash",
          "sessionId",
          "signature",
          "version",
        ],
    "human wallet approval response",
  );
  if (
    record.version !== HUMAN_WALLET_SIGNING_RESPONSE_VERSION ||
    record.sessionId !== expected.sessionId
  ) {
    throw new Error(
      "human wallet approval response does not match the session",
    );
  }
  if (rejected) {
    if (record.reason !== "user-rejected") {
      throw new Error("human wallet rejection reason is unsupported");
    }
    return Object.freeze({ outcome: "rejected", reason: "user-rejected" });
  }
  if (
    record.outcome !== "approved" ||
    record.preparedTransactionHash !== expected.preparedTransactionHash
  ) {
    throw new Error("human wallet approval does not match the prepared hash");
  }
  const signature = exactWalletDataRecord(
    record.signature,
    ["party", "signature", "signatureFormat", "signedBy", "signingAlgorithm"],
    "human wallet signature",
  );
  const signatureFormat = capabilityWalletSignatureFormat(
    signature.signatureFormat,
  );
  const signingAlgorithm = capabilityWalletSigningAlgorithm(
    signature.signingAlgorithm,
  );
  if (
    !isSupportedCapabilityWalletSignatureScheme(
      signatureFormat,
      signingAlgorithm,
    )
  ) {
    throw new Error("human wallet signature scheme is unsupported");
  }
  return Object.freeze({
    outcome: "approved" as const,
    signature: Object.freeze({
      party: identifier(signature.party, "human wallet signature Party", 512),
      signature: identifier(
        signature.signature,
        "human wallet signature bytes",
        16_384,
      ),
      signatureFormat,
      signedBy: cantonFingerprint(
        signature.signedBy,
        "human wallet signer fingerprint",
      ),
      signingAlgorithm,
    }),
  });
}
