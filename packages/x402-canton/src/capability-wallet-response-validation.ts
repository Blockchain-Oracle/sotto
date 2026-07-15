import type { CapabilityWalletSignatureEnvelope } from "./capability-wallet-connector-types.js";
import {
  capabilityWalletSignatureFormat,
  capabilityWalletSigningAlgorithm,
  isSupportedCapabilityWalletSignatureScheme,
} from "./capability-wallet-signature-scheme.js";
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
    throw new Error("capability wallet signature scheme is unsupported");
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
