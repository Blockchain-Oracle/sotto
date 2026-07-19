export const LIVE_FIVE_NORTH_HUMAN_PURCHASE_TIMEOUT_MS = 600_000;

export function requireLiveHumanPurchaseActive(
  signal: unknown,
): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal)) {
    throw new Error("live Five North human purchase signal is invalid");
  }
  if (signal.aborted) {
    throw new Error("live Five North human purchase cancelled");
  }
}

export async function withLiveHumanPurchaseDeadline<T>(
  callerSignal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  requireLiveHumanPurchaseActive(callerSignal);
  const controller = new AbortController();
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callerSignal.removeEventListener("abort", onCancel);
      complete();
    };
    const onCancel = () => {
      controller.abort();
      finish(() =>
        reject(new Error("live Five North human purchase cancelled")),
      );
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() =>
        reject(new Error("live Five North human purchase deadline exceeded")),
      );
    }, LIVE_FIVE_NORTH_HUMAN_PURCHASE_TIMEOUT_MS);
    callerSignal.addEventListener("abort", onCancel, { once: true });
    if (callerSignal.aborted) return onCancel();
    try {
      void work(controller.signal).then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
