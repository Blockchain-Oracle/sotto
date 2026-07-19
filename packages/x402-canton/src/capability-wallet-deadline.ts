export function withCapabilityWalletDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMilliseconds: number,
  outerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => {
      controller.abort();
      finish(() => reject(new Error("capability wallet signing cancelled")));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new Error("capability wallet approval timed out")));
    }, timeoutMilliseconds);
    outerSignal?.addEventListener("abort", onAbort, { once: true });
    if (outerSignal?.aborted === true) {
      onAbort();
      return;
    }
    void work(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
