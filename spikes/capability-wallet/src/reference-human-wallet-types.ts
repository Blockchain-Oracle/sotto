import type {
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
  HumanWalletCapabilities,
  HumanWalletConnector,
  HumanWalletSignatureEnvelope,
} from "@sotto/x402-canton";
import type { WalletHandoffStorage } from "./wallet-handoff-storage.js";

export type ReferenceHumanWalletConnectorInput = Readonly<{
  capabilities: HumanWalletCapabilities;
  exchange: (
    handoffId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<void>;
  storage: WalletHandoffStorage;
}>;

export type ReferenceHumanWalletConnector = HumanWalletConnector;

export type ReferenceHumanWalletApprovalResponse =
  | Readonly<{
      version: typeof HUMAN_WALLET_SIGNING_RESPONSE_VERSION;
      outcome: "rejected";
      reason: "user-rejected";
      sessionId: `sha256:${string}`;
    }>
  | Readonly<{
      version: typeof HUMAN_WALLET_SIGNING_RESPONSE_VERSION;
      outcome: "approved";
      preparedTransactionHash: `sha256:${string}`;
      sessionId: `sha256:${string}`;
      signature: HumanWalletSignatureEnvelope;
    }>;

type ReferenceHumanWalletRunBase = Readonly<{
  handoffId: string;
  presentSummary: (summary: string) => void | Promise<void>;
  rootDirectory: string;
  signal?: AbortSignal;
}>;

export type ReferenceHumanWalletRunInput = ReferenceHumanWalletRunBase &
  (
    | Readonly<{ approved: false; keyFile?: never }>
    | Readonly<{ approved: true; keyFile: string }>
  );
