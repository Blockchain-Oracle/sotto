export { SDK, signTransactionHash } from "@canton-network/wallet-sdk";
export {
  createWalletHandoffStorage,
  MAX_WALLET_HANDOFF_JSON_BYTES,
  type WalletHandoffInput,
  type WalletHandoffKind,
  type WalletHandoffRecord,
  type WalletHandoffStorage,
} from "./wallet-handoff-storage.js";
export {
  createReferenceWalletConnector,
  runReferenceWalletApproval,
} from "./reference-wallet.js";

export const CANTON_WALLET_SDK_REFERENCE = Object.freeze({
  packageName: "@canton-network/wallet-sdk",
  repository: "canton-network/wallet",
  version: "1.4.0",
});
