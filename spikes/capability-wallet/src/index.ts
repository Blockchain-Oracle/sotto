export {
  createWalletHandoffStorage,
  MAX_WALLET_HANDOFF_JSON_BYTES,
  type WalletHandoffInput,
  type WalletHandoffKind,
  type WalletHandoffRecord,
  type WalletHandoffStorage,
} from "./wallet-handoff-storage.js";
export { createReferenceWalletConnector } from "./reference-wallet.js";
export { createReferenceHumanWalletConnector } from "./reference-human-wallet.js";
export type {
  ReferenceHumanWalletConnector,
  ReferenceHumanWalletConnectorInput,
} from "./reference-human-wallet-types.js";
export {
  readReferenceWalletPublicIdentity,
  recomputeReferenceWalletPreparedHash,
  type ReferenceWalletPublicIdentity,
} from "./reference-wallet-public-identity.js";
export {
  createEphemeralExternalPartyPreflightIdentity,
  type ExternalPartyPreflightIdentity,
} from "./external-party-preflight-key.js";
export { parseReferenceHumanWalletApproval } from "./reference-human-wallet-approval.js";
export {
  signReferenceWalletPreparedHash,
  type ReferenceWalletPreparedHashSignature,
} from "./reference-wallet-signing.js";
export { runFiveNorthExternalPayerCli } from "./five-north-external-payer-cli.js";
export { runFiveNorthExternalPayerTapCli } from "./five-north-external-payer-tap-cli.js";
export { externalPayerJournalPath } from "./five-north-external-payer-journal.js";
export { externalPayerTapJournalPath } from "./five-north-external-payer-tap-journal.js";
export type { FiveNorthExternalPayerResult } from "./five-north-external-payer-types.js";

export const CANTON_WALLET_SDK_REFERENCE = Object.freeze({
  packageName: "@canton-network/wallet-sdk",
  repository: "canton-network/wallet",
  version: "1.4.0",
});
