import { reconcileJobDedupe } from "./purchase-human-event.js";
import type {
  HumanEventTransitionRow,
  HumanTransitionState,
} from "./purchase-human-transition-types.js";
import { PurchasePersistenceError } from "./purchase-types.js";
import { uuid } from "./publication-validation-primitives.js";

const LEASE_OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function timestamp(value: Date | null): string | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PurchasePersistenceError();
  }
  return value.toISOString();
}

function generation(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new PurchasePersistenceError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PurchasePersistenceError();
  }
  return parsed;
}

export function validateReconcileJob(
  state: HumanTransitionState,
  execution: HumanEventTransitionRow,
): void {
  if (state.jobs.length !== 1) throw new PurchasePersistenceError();
  const job = state.jobs[0]!;
  try {
    uuid(job.jobId, "reconcile job ID");
  } catch {
    throw new PurchasePersistenceError();
  }
  const leaseGeneration = generation(job.leaseGeneration);
  const availableAt = timestamp(job.availableAt);
  const createdAt = timestamp(job.createdAt);
  if (
    job.dedupeKey !==
      reconcileJobDedupe(state.attempt.attemptId, execution.eventHash) ||
    job.eventSequence !== "5" ||
    job.kind !== "purchase-reconcile" ||
    availableAt === null ||
    createdAt === null ||
    Date.parse(availableAt) < Date.parse(createdAt)
  ) {
    throw new PurchasePersistenceError();
  }
  if (job.state === "ready") {
    if (
      job.resultEventSequence !== null ||
      job.completedAt !== null ||
      job.leaseOwner !== null ||
      job.leaseExpiresAt !== null ||
      job.claimedAt !== null ||
      (leaseGeneration === 0 && availableAt !== createdAt)
    ) {
      throw new PurchasePersistenceError();
    }
    return;
  }
  const claimedAt = timestamp(job.claimedAt);
  const leaseExpiresAt = timestamp(job.leaseExpiresAt);
  if (
    leaseGeneration < 1 ||
    typeof job.leaseOwner !== "string" ||
    !LEASE_OWNER.test(job.leaseOwner) ||
    claimedAt === null ||
    leaseExpiresAt === null ||
    Date.parse(claimedAt) < Date.parse(availableAt) ||
    Date.parse(leaseExpiresAt) <= Date.parse(claimedAt)
  ) {
    throw new PurchasePersistenceError();
  }
  if (job.state === "leased") {
    if (job.resultEventSequence !== null || job.completedAt !== null) {
      throw new PurchasePersistenceError();
    }
    return;
  }
  const completedAt = timestamp(job.completedAt);
  const terminal = state.events[5];
  if (
    job.state !== "completed" ||
    job.resultEventSequence !== "6" ||
    completedAt === null ||
    terminal === undefined ||
    terminal.sequence !== "6" ||
    completedAt !== timestamp(terminal.recordedAt) ||
    Date.parse(completedAt) < Date.parse(claimedAt) ||
    Date.parse(completedAt) >= Date.parse(leaseExpiresAt)
  ) {
    throw new PurchasePersistenceError();
  }
}
