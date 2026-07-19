import type { HumanPrepareAuthorityLease } from "@sotto/database";
import { HumanPrepareWorkerError } from "./human-prepare-worker-types.js";

export const HUMAN_PREPARE_WORKER_LEASE_MS = 60_000;
export const HUMAN_PREPARE_CHECKPOINT_RESERVE_MS = 15_000;

export function requireCallerActive(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new HumanPrepareWorkerError("HUMAN_PREPARE_CANCELLED");
  }
}

export function createHumanPrepareLeaseDeadline(
  lease: HumanPrepareAuthorityLease,
  caller?: AbortSignal,
) {
  requireCallerActive(caller);
  const deadline =
    Date.parse(lease.leaseExpiresAt) - HUMAN_PREPARE_CHECKPOINT_RESERVE_MS;
  const remaining = deadline - Date.now();
  if (!Number.isSafeInteger(deadline) || remaining < 1) {
    throw new HumanPrepareWorkerError("HUMAN_PREPARE_LEASE_EXPIRED");
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  caller?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, remaining);
  timer.unref();
  const requireActive = () => {
    if (caller?.aborted === true) {
      throw new HumanPrepareWorkerError("HUMAN_PREPARE_CANCELLED");
    }
    if (controller.signal.aborted) {
      throw new HumanPrepareWorkerError("HUMAN_PREPARE_LEASE_EXPIRED");
    }
  };
  return Object.freeze({
    signal: controller.signal,
    requireActive,
    dispose: () => {
      clearTimeout(timer);
      caller?.removeEventListener("abort", cancel);
    },
  });
}

export function runWithinHumanPrepareDeadline<T>(
  deadline: ReturnType<typeof createHumanPrepareLeaseDeadline>,
  work: () => Promise<T>,
): Promise<T> {
  deadline.requireActive();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      deadline.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => {
        try {
          deadline.requireActive();
        } catch (error) {
          reject(error);
        }
      });
    deadline.signal.addEventListener("abort", onAbort, { once: true });
    if (deadline.signal.aborted) {
      onAbort();
      return;
    }
    void Promise.resolve()
      .then(work)
      .then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
  });
}
