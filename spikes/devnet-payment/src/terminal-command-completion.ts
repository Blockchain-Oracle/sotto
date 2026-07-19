import type { CapabilityBootstrapCompletion } from "./capability-bootstrap-completion.js";

export type TerminalCommandCompletion = Exclude<
  CapabilityBootstrapCompletion,
  Readonly<{
    classification: "ABSENT_COMPLETE";
    completionOffset: number;
  }>
>;

type Input = Readonly<{
  attemptLimit: number;
  readCompletion: () => Promise<CapabilityBootstrapCompletion>;
  signal: AbortSignal;
  waitForRetry: () => Promise<void>;
}>;

function requireActive(signal: AbortSignal): void {
  if (!(signal instanceof AbortSignal) || signal.aborted) {
    throw new Error("command completion cancelled");
  }
}

async function runInterruptibly<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  requireActive(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onAbort = () =>
      finish(() => reject(new Error("command completion cancelled")));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    try {
      void operation().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export async function awaitTerminalCommandCompletion(
  input: Input,
): Promise<TerminalCommandCompletion> {
  if (
    !Number.isSafeInteger(input.attemptLimit) ||
    input.attemptLimit < 1 ||
    input.attemptLimit > 1_000 ||
    typeof input.readCompletion !== "function" ||
    typeof input.waitForRetry !== "function"
  ) {
    throw new Error("terminal command completion input is invalid");
  }
  for (let attempt = 1; attempt <= input.attemptLimit; attempt += 1) {
    requireActive(input.signal);
    const completion = await runInterruptibly(
      input.readCompletion,
      input.signal,
    );
    requireActive(input.signal);
    if (
      completion.classification === "SUCCEEDED" ||
      completion.classification === "REJECTED"
    ) {
      return completion;
    }
    if (completion.classification !== "ABSENT_COMPLETE") {
      throw new Error("command completion classification is invalid");
    }
    if (attempt < input.attemptLimit) {
      await runInterruptibly(input.waitForRetry, input.signal);
    }
  }
  throw new Error("command completion requires reconciliation");
}
