import type { HumanReconciliationLease } from "@sotto/database";
import { createHumanReconciliationWorkerError } from "./human-reconciliation-worker-types.js";

export const HUMAN_RECONCILIATION_WORKER_LEASE_MS = 60_000;
export const HUMAN_RECONCILIATION_CHECKPOINT_RESERVE_MS = 5_000;

export function requireReconciliationCallerActive(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw createHumanReconciliationWorkerError(
      "HUMAN_RECONCILIATION_CANCELLED",
    );
  }
}

export function createHumanReconciliationLeaseDeadline(
  lease: HumanReconciliationLease,
  caller?: AbortSignal,
) {
  requireReconciliationCallerActive(caller);
  const deadline =
    Date.parse(lease.leaseExpiresAt) -
    HUMAN_RECONCILIATION_CHECKPOINT_RESERVE_MS;
  const remaining = deadline - Date.now();
  if (!Number.isSafeInteger(deadline) || remaining < 1) {
    throw createHumanReconciliationWorkerError(
      "HUMAN_RECONCILIATION_LEASE_EXPIRED",
    );
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  caller?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, remaining);
  timer.unref();
  const requireActive = () => {
    if (caller?.aborted === true) {
      throw createHumanReconciliationWorkerError(
        "HUMAN_RECONCILIATION_CANCELLED",
      );
    }
    if (controller.signal.aborted) {
      throw createHumanReconciliationWorkerError(
        "HUMAN_RECONCILIATION_LEASE_EXPIRED",
      );
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

export function runWithinHumanReconciliationDeadline<T>(
  deadline: ReturnType<typeof createHumanReconciliationLeaseDeadline>,
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
    try {
      void work().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
