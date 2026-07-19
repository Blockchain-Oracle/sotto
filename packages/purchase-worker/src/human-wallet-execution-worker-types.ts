import type { PurchaseRepository } from "@sotto/database";
import type {
  createHumanWalletSigningSession,
  HumanWalletSigningDependencies,
  VerifiedHumanWalletSigningSession,
} from "@sotto/x402-canton";
import type { HumanPrepareWorkerResult } from "./human-prepare-worker-types.js";

export type HumanWalletExecutionPrepared = Extract<
  HumanPrepareWorkerResult,
  { outcome: "prepared-hash-verified" }
>;

export type HumanWalletExecutionStarted = Readonly<{
  sessionId: `sha256:${string}`;
  submissionId: string;
  userId: string;
}>;

export type HumanWalletExecuteResult = Readonly<{
  outcome: "submitted";
  preparedTransactionHash: `sha256:${string}`;
}>;

export type HumanWalletExecutionDispatch = HumanWalletExecutionStarted &
  Readonly<{
    preparedTransactionHash: `sha256:${string}`;
    execute(
      options: Readonly<{ signal?: AbortSignal }>,
    ): Promise<HumanWalletExecuteResult>;
  }>;

export type HumanWalletExecuteTransport = Readonly<{
  createDispatch(
    verified: VerifiedHumanWalletSigningSession,
    options: Readonly<{ signal?: AbortSignal }>,
  ): Promise<HumanWalletExecutionDispatch>;
}>;

export type HumanWalletExecutionWorkerDependencies = Readonly<{
  repository: PurchaseRepository;
  resolveRegisteredPublicKey: HumanWalletSigningDependencies["resolveRegisteredPublicKey"];
  executeTransport: HumanWalletExecuteTransport;
  createSigningSession?: typeof createHumanWalletSigningSession;
}>;

export type HumanWalletExecutionWorkerInput = Readonly<{
  prepared: HumanWalletExecutionPrepared;
  signal?: AbortSignal;
}>;

type WalletTerminalResult = Readonly<{
  attemptId: `sha256:${string}`;
  connectorId: string;
  connectorKind: "openrpc" | "wallet-sdk";
  outcome: "wallet-rejected" | "wallet-unsupported";
  reason: string;
}>;

type ExecutionResult = HumanWalletExecutionStarted &
  Readonly<{
    attemptId: `sha256:${string}`;
    outcome:
      "execution-submitted" | "execution-uncertain" | "reconciliation-only";
  }>;

export type HumanWalletExecutionWorkerResult =
  WalletTerminalResult | ExecutionResult;

export type HumanWalletExecutionWorker = Readonly<{
  runOne(
    input: HumanWalletExecutionWorkerInput,
  ): Promise<HumanWalletExecutionWorkerResult>;
}>;

export type HumanWalletExecutionWorkerErrorCode =
  "HUMAN_WALLET_EXECUTION_CANCELLED" | "HUMAN_WALLET_EXECUTION_FAILED";

export class HumanWalletExecutionWorkerError extends Error {
  constructor(readonly code: HumanWalletExecutionWorkerErrorCode) {
    super(
      code === "HUMAN_WALLET_EXECUTION_CANCELLED"
        ? "human wallet execution cancelled"
        : "human wallet execution failed",
    );
    this.name = "HumanWalletExecutionWorkerError";
  }
}
