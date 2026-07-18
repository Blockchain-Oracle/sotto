import type {
  HumanReconciliationCheckpointResult,
  HumanReconciliationDeferResult,
  HumanReconciliationRepository,
  Sha256Identifier,
} from "@sotto/database";

export type HumanReconciliationProbeRequest = Readonly<{
  beginExclusive: number;
  commandId: string;
  payerParty: string;
  providerParty: string;
  submissionId: string;
  synchronizerId: string;
  userId: string;
}>;

export type HumanReconciliationReadOnlyAdapter = (
  request: HumanReconciliationProbeRequest,
  options: Readonly<{ signal: AbortSignal }>,
) => Promise<unknown>;

export type HumanReconciliationWorkerDependencies = Readonly<{
  repository: HumanReconciliationRepository;
  readReconciliation: HumanReconciliationReadOnlyAdapter;
}>;

export type HumanReconciliationWorkerInput = Readonly<{
  leaseOwner: string;
  attemptId?: Sha256Identifier;
  signal?: AbortSignal;
}>;

export type HumanReconciliationWorkerResult =
  | Readonly<{ outcome: "idle" }>
  | Readonly<{
      outcome: "pending";
      checkpoint: HumanReconciliationDeferResult;
    }>
  | Readonly<{
      outcome: "settlement-rejected" | "settlement-reconciled";
      checkpoint: HumanReconciliationCheckpointResult;
    }>;

export type HumanReconciliationWorker = Readonly<{
  runOne(
    input: HumanReconciliationWorkerInput,
  ): Promise<HumanReconciliationWorkerResult>;
}>;

export type HumanReconciliationWorkerErrorCode =
  | "HUMAN_RECONCILIATION_CANCELLED"
  | "HUMAN_RECONCILIATION_LEASE_EXPIRED"
  | "HUMAN_RECONCILIATION_FAILED";

const workerErrorAuthority = Symbol("human-reconciliation-worker-error");
const workerOwnedErrors = new WeakSet<object>();

export class HumanReconciliationWorkerError extends Error {
  readonly code: HumanReconciliationWorkerErrorCode;

  constructor(
    candidateCode: HumanReconciliationWorkerErrorCode,
    authority?: symbol,
  ) {
    const code =
      authority === workerErrorAuthority
        ? candidateCode
        : "HUMAN_RECONCILIATION_FAILED";
    super(
      code === "HUMAN_RECONCILIATION_CANCELLED"
        ? "human reconciliation worker cancelled"
        : code === "HUMAN_RECONCILIATION_LEASE_EXPIRED"
          ? "human reconciliation worker lease window exhausted"
          : "human reconciliation worker failed",
    );
    this.code = code;
    this.name = "HumanReconciliationWorkerError";
  }
}

/** @internal Worker-owned classification only. */
export function createHumanReconciliationWorkerError(
  code: HumanReconciliationWorkerErrorCode,
): HumanReconciliationWorkerError {
  const error = new HumanReconciliationWorkerError(code, workerErrorAuthority);
  workerOwnedErrors.add(error);
  return Object.freeze(error);
}

/** @internal Worker-owned classification only. */
export function isWorkerOwnedHumanReconciliationError(
  error: unknown,
): error is HumanReconciliationWorkerError {
  return (
    typeof error === "object" && error !== null && workerOwnedErrors.has(error)
  );
}
