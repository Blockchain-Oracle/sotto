export type WalletConnectorKind = "openrpc" | "wallet-sdk";
export type WalletSignatureFormat =
  "SIGNATURE_FORMAT_CONCAT" | "SIGNATURE_FORMAT_DER";
export type WalletSigningAlgorithm =
  "SIGNING_ALGORITHM_SPEC_ED25519" | "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256";
export type WalletPublicKeyFormat =
  "PUBLIC_KEY_FORMAT_DER_SPKI" | "PUBLIC_KEY_FORMAT_RAW";

export type PreparedWalletConnector<Request> = Readonly<{
  discover: (options: Readonly<{ signal: AbortSignal }>) => Promise<unknown>;
  requestApproval: (
    request: Request,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<unknown>;
}>;
