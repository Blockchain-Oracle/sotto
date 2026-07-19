import { vi } from "vitest";
import type { PurchaseRepository } from "@sotto/database";
import type {
  HumanWalletSigningResult,
  VerifiedHumanWalletSigningSession,
} from "@sotto/x402-canton";
import {
  createHumanPrepareWorker,
  type HumanPrepareWorkerResult,
} from "../src/index.js";
import {
  officialHash,
  workerTestContext,
} from "./human-prepare-worker.fixtures.js";

export const SESSION_ID = `sha256:${"7".repeat(64)}` as const;
export const SUBMISSION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b99001";
export const EXECUTION_USER_ID = "validator-devnet-m2m";
export const RAW_SIGNATURE_SENTINEL = "private-wallet-signature-sentinel";

export type PreparedWorkerResult = Extract<
  HumanPrepareWorkerResult,
  { outcome: "prepared-hash-verified" }
>;

export async function preparedWorkerResult(
  requestApproval?: Parameters<typeof workerTestContext>[1],
): Promise<PreparedWorkerResult> {
  const context = await workerTestContext(599, requestApproval);
  const worker = createHumanPrepareWorker({
    repository: context.repository,
    resolveAuthority: async () => context.restored,
    createReaders: () => context.readers,
    recomputeOfficialHash: officialHash,
  });
  const result = await worker.runOne({ leaseOwner: "wallet-execution-test" });
  if (result.outcome !== "prepared-hash-verified") {
    throw new Error("test prepare worker did not produce its handoff");
  }
  return result;
}

export function verifiedSigningResult(
  prepared: PreparedWorkerResult,
  sessionId = SESSION_ID,
): VerifiedHumanWalletSigningSession {
  return {
    version: "sotto-human-wallet-signing-session-v1",
    connectorId: "sotto-reference-wallet",
    connectorKind: "wallet-sdk",
    origin: "http://127.0.0.1:43121",
    outcome: "verified",
    preparedTransactionHash: prepared.approval.preparedTransactionHash,
    sessionId,
    verifiedAt: new Date().toISOString(),
    rawSignature: RAW_SIGNATURE_SENTINEL,
  } as unknown as VerifiedHumanWalletSigningSession;
}

export function rejectedSigningResult(
  sessionId = SESSION_ID,
): HumanWalletSigningResult {
  return Object.freeze({
    version: "sotto-human-wallet-signing-session-v1",
    connectorId: "sotto-reference-wallet",
    connectorKind: "wallet-sdk",
    origin: "http://127.0.0.1:43121",
    outcome: "rejected" as const,
    reason: "user-rejected" as const,
    sessionId,
  });
}

export function unsupportedSigningResult(): HumanWalletSigningResult {
  return Object.freeze({
    connectorId: "sotto-reference-wallet",
    connectorKind: "wallet-sdk",
    origin: "http://127.0.0.1:43121",
    outcome: "unsupported" as const,
    reason: "unsupported-network" as const,
  });
}

function transition(state: string, sequence: 3 | 4 | 5) {
  return Object.freeze({
    outcome: "created" as const,
    attemptId: `sha256:${"1".repeat(64)}` as const,
    state,
    event: Object.freeze({
      sequence,
      type: state,
      eventHash: `sha256:${"2".repeat(64)}` as const,
      previousEventHash: `sha256:${"3".repeat(64)}` as const,
      recordedAt: new Date().toISOString(),
    }),
  });
}

export function executionRepository(prepared: PreparedWorkerResult) {
  const commandId = `sotto-human-purchase-v1-${prepared.approval.purchaseCommitment.slice(7)}`;
  let lifecycleReads = 0;
  const repository = {
    recordHumanApprovalRequested: vi.fn(async () =>
      transition("approval-requested", 3),
    ),
    recordHumanWalletDecision: vi.fn(async (input: { outcome: string }) =>
      transition(
        `wallet-${input.outcome}`,
        input.outcome === "rejected" ? 4 : 3,
      ),
    ),
    recordHumanSignatureVerified: vi.fn(async () =>
      transition("signature-verified", 4),
    ),
    beginHumanExecution: vi.fn(async () => transition("execution-started", 5)),
    readHumanPurchaseLifecycle: vi.fn(async () => {
      lifecycleReads += 1;
      const state =
        lifecycleReads === 1 ? "prepared-hash-verified" : "signature-verified";
      return {
        attemptId: prepared.approval.attemptId,
        commandId,
        state,
        preparedTransactionHash: prepared.approval.preparedTransactionHash,
        connectorId:
          state === "prepared-hash-verified" ? null : "sotto-reference-wallet",
        connectorKind: state === "prepared-hash-verified" ? null : "wallet-sdk",
        sessionId: state === "prepared-hash-verified" ? null : SESSION_ID,
        submissionId: null,
        userId: null,
        latestEventSequence: state === "signature-verified" ? 4 : 2,
        latestEventType: state,
      };
    }),
  };
  return repository as typeof repository & PurchaseRepository;
}
