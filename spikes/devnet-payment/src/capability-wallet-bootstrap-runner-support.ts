import { createHash } from "node:crypto";
import type {
  BoundedCapabilityBootstrapRequest,
  CapabilityWalletConnector,
  CapabilityWalletRegisteredPublicKeyQuery,
  PreparedCapabilityBootstrapReader,
  VerifiedCapabilityWalletSignature,
} from "@sotto/x402-canton";
import type { CapabilityBootstrapCompletion } from "./capability-bootstrap-completion.js";

export type CapabilityWalletExecutionStarted = Readonly<{
  sessionId: `sha256:${string}`;
  submissionId: string;
  userId: string;
}>;
export type CapabilityWalletExecutionResult = CapabilityWalletExecutionStarted &
  Readonly<{
    outcome: "submitted";
    preparedTransactionHash: `sha256:${string}`;
  }>;

export type CapabilityWalletBootstrapRunnerInput = Readonly<{
  connector: CapabilityWalletConnector;
  connectorId: string;
  connectorOrigin: string;
  execute: (
    verified: VerifiedCapabilityWalletSignature,
    persistStarted: (value: CapabilityWalletExecutionStarted) => Promise<void>,
  ) => Promise<CapabilityWalletExecutionResult>;
  prepare: PreparedCapabilityBootstrapReader;
  readActiveCapabilities: () => Promise<unknown>;
  readCompletion: (
    beginExclusive: number,
    request: BoundedCapabilityBootstrapRequest,
  ) => Promise<CapabilityBootstrapCompletion>;
  readLedgerEndOffset: () => Promise<number>;
  recomputeOfficialHash: (value: Uint8Array) => Promise<Uint8Array>;
  request: BoundedCapabilityBootstrapRequest;
  resolveRegisteredPublicKey: (
    query: CapabilityWalletRegisteredPublicKeyQuery,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<unknown>;
  signal: AbortSignal;
  sourceCommit: string;
  timeoutMilliseconds: number;
  workspaceRoot: string;
}>;

export class CapabilityWalletBootstrapApprovalError extends Error {
  constructor(
    readonly outcome: "rejected" | "unsupported",
    readonly reason: string,
  ) {
    super(`capability wallet approval ${outcome}`);
  }
}

export function capabilityWalletSignatureSha256(
  value: string,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(Buffer.from(value, "base64"))
    .digest("hex")}`;
}

export function requireCapabilityWalletExecutionResult(
  result: CapabilityWalletExecutionResult,
  started: CapabilityWalletExecutionStarted | null,
  expected: Readonly<{
    preparedTransactionHash: string;
    sessionId: string;
    userId: string;
  }>,
): void {
  if (
    started === null ||
    result.outcome !== "submitted" ||
    result.preparedTransactionHash !== expected.preparedTransactionHash ||
    result.sessionId !== expected.sessionId ||
    result.userId !== expected.userId ||
    JSON.stringify(started) !==
      JSON.stringify({
        sessionId: result.sessionId,
        submissionId: result.submissionId,
        userId: result.userId,
      })
  ) {
    throw new Error("capability wallet execution result is inconsistent");
  }
}
