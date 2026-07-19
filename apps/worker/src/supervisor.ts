export type WorkerLoopStepResult = "idle" | "progressed";

export type WorkerLoop = Readonly<{
  name: string;
  runStep(signal: AbortSignal): Promise<WorkerLoopStepResult>;
}>;

export type WorkerOperationalEvent = Readonly<{
  code: "WORKER_LOOP_ERROR";
  loop: string;
  message: string;
}>;

export type SupervisorOptions = Readonly<{
  signal: AbortSignal;
  onEvent: (event: WorkerOperationalEvent) => void;
  idleDelayMilliseconds?: number;
  minimumBackoffMilliseconds?: number;
  maximumBackoffMilliseconds?: number;
  random?: () => number;
}>;

const DEFAULT_IDLE_DELAY_MS = 2_000;
const DEFAULT_MINIMUM_BACKOFF_MS = 1_000;
const DEFAULT_MAXIMUM_BACKOFF_MS = 15_000;

function validateOptions(candidate: SupervisorOptions): void {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !(candidate.signal instanceof AbortSignal) ||
    typeof candidate.onEvent !== "function"
  ) {
    throw new Error("worker supervisor options are invalid");
  }
  for (const value of [
    candidate.idleDelayMilliseconds,
    candidate.minimumBackoffMilliseconds,
    candidate.maximumBackoffMilliseconds,
  ]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error("worker supervisor delays are invalid");
    }
  }
}

function validateLoop(candidate: WorkerLoop): void {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.name !== "string" ||
    candidate.name === "" ||
    typeof candidate.runStep !== "function"
  ) {
    throw new Error("worker loop is invalid");
  }
}

/** Abort-aware sleep that resolves (never rejects) on abort. */
export function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || milliseconds <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "unknown worker loop failure";
}

/**
 * Runs one named loop step forever until the supervisor signal aborts.
 * Failures never escape: each error becomes one operational event followed
 * by a full-jitter backoff between the minimum and maximum bounds. Idle
 * results sleep the idle delay; progressed results continue immediately.
 */
export async function runSupervisedLoop(
  loop: WorkerLoop,
  options: SupervisorOptions,
): Promise<void> {
  validateLoop(loop);
  validateOptions(options);
  const idleDelay = options.idleDelayMilliseconds ?? DEFAULT_IDLE_DELAY_MS;
  const minimumBackoff =
    options.minimumBackoffMilliseconds ?? DEFAULT_MINIMUM_BACKOFF_MS;
  const maximumBackoff =
    options.maximumBackoffMilliseconds ?? DEFAULT_MAXIMUM_BACKOFF_MS;
  if (maximumBackoff < minimumBackoff) {
    throw new Error("worker supervisor backoff bounds are inverted");
  }
  const random = options.random ?? Math.random;
  while (!options.signal.aborted) {
    let result: WorkerLoopStepResult;
    try {
      result = await loop.runStep(options.signal);
    } catch (error) {
      if (options.signal.aborted) return;
      options.onEvent(
        Object.freeze({
          code: "WORKER_LOOP_ERROR" as const,
          loop: loop.name,
          message: errorMessage(error),
        }),
      );
      const jittered =
        minimumBackoff + random() * (maximumBackoff - minimumBackoff);
      await abortableDelay(Math.round(jittered), options.signal);
      continue;
    }
    if (options.signal.aborted) return;
    if (result === "idle") await abortableDelay(idleDelay, options.signal);
  }
}

/**
 * Hosts every loop of the one restartable worker process (Q-006). Resolves
 * once all loops have drained after the shared signal aborts.
 */
export async function runSupervisor(
  loops: ReadonlyArray<WorkerLoop>,
  options: SupervisorOptions,
): Promise<void> {
  if (!Array.isArray(loops) || loops.length === 0) {
    throw new Error("worker supervisor requires at least one loop");
  }
  const names = new Set(loops.map((loop) => loop.name));
  if (names.size !== loops.length) {
    throw new Error("worker loop names must be unique");
  }
  await Promise.all(loops.map((loop) => runSupervisedLoop(loop, options)));
}
