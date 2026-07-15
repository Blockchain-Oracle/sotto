import {
  CAPABILITY_WALLET_SIGNATURE_FORMAT,
  CAPABILITY_WALLET_SIGNING_ALGORITHM,
  type CapabilityWalletSignatureEnvelope,
} from "./capability-wallet-connector-types.js";
import {
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

export function parseCapabilityWalletApprovalResponse(value: unknown):
  | Readonly<{ outcome: "rejected"; reason: "user-rejected" }>
  | Readonly<{
      outcome: "approved";
      signature: CapabilityWalletSignatureEnvelope;
    }> {
  const record = objectValue(value, "capability wallet approval response");
  if (record.outcome === "rejected") {
    exactKeys(record, ["outcome", "reason"], "capability wallet rejection");
    if (record.reason !== "user-rejected") {
      throw new Error("capability wallet rejection reason is unsupported");
    }
    return Object.freeze({ outcome: "rejected", reason: "user-rejected" });
  }
  exactKeys(record, ["outcome", "signature"], "capability wallet approval");
  if (record.outcome !== "approved") {
    throw new Error("capability wallet approval outcome is unsupported");
  }
  const signature = objectValue(
    record.signature,
    "capability wallet signature",
  );
  exactKeys(
    signature,
    ["party", "signature", "signatureFormat", "signedBy", "signingAlgorithm"],
    "capability wallet signature",
  );
  const signatureFormat = identifier(
    signature.signatureFormat,
    "wallet signature format",
  );
  if (signatureFormat !== CAPABILITY_WALLET_SIGNATURE_FORMAT) {
    throw new Error("capability wallet signature format is unsupported");
  }
  const signingAlgorithm = identifier(
    signature.signingAlgorithm,
    "wallet signing algorithm",
  );
  if (signingAlgorithm !== CAPABILITY_WALLET_SIGNING_ALGORITHM) {
    throw new Error("capability wallet signing algorithm is unsupported");
  }
  return Object.freeze({
    outcome: "approved" as const,
    signature: Object.freeze({
      party: identifier(signature.party, "wallet signature Party"),
      signature: identifier(
        signature.signature,
        "wallet signature bytes",
        16_384,
      ),
      signatureFormat,
      signedBy: identifier(signature.signedBy, "wallet signer fingerprint"),
      signingAlgorithm,
    }),
  });
}
