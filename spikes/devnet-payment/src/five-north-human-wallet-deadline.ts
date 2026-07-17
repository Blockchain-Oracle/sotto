export const FIVE_NORTH_HUMAN_WALLET_PREFLIGHT_TIMEOUT_MS = 10_000;

export async function withFiveNorthHumanWalletDeadline<T>(
  callerSignal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!(callerSignal instanceof AbortSignal)) {
    throw new Error("Five North human wallet signal is invalid");
  }
  if (callerSignal.aborted) {
    throw new Error("Five North human wallet cancelled");
  }
  const controller = new AbortController();
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      callerSignal.removeEventListener("abort", onCallerAbort);
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onCallerAbort = () => {
      controller.abort();
      finish(() => reject(new Error("Five North human wallet cancelled")));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() =>
        reject(new Error("Five North human wallet deadline exceeded")),
      );
    }, FIVE_NORTH_HUMAN_WALLET_PREFLIGHT_TIMEOUT_MS);
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    if (callerSignal.aborted) onCallerAbort();
    if (settled) return;
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
