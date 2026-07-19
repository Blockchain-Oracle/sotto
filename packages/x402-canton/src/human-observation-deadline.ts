import { optionalWalletDataRecord } from "./wallet-data-record.js";

export type HumanObservationOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}>;

export type HumanObservationReadOptions = Readonly<{
  signal: AbortSignal;
}>;

function isAborted(signal: AbortSignal): boolean {
  return Reflect.get(AbortSignal.prototype, "aborted", signal) === true;
}

export function requireHumanObservationActive(
  signal: AbortSignal,
  label: string,
): void {
  if (isAborted(signal)) throw new Error(`${label} interrupted`);
}

export async function withHumanObservationDeadline<T>(
  label: string,
  maximumMilliseconds: number,
  options: HumanObservationOptions,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let validated: Readonly<Record<string, unknown>>;
  try {
    validated = optionalWalletDataRecord(
      options,
      ["signal", "timeoutMilliseconds"],
      `${label} options`,
    );
  } catch {
    throw new Error(`${label} options are invalid`);
  }
  const callerSignal = validated.signal;
  const timeout = validated.timeoutMilliseconds ?? maximumMilliseconds;
  if (
    typeof timeout !== "number" ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > maximumMilliseconds
  ) {
    throw new Error(`${label} timeout is invalid`);
  }
  if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) {
    throw new Error(`${label} signal is invalid`);
  }
  if (callerSignal !== undefined && isAborted(callerSignal)) {
    throw new Error(`${label} cancelled`);
  }
  const controller = new AbortController();
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      if (callerSignal !== undefined) {
        EventTarget.prototype.removeEventListener.call(
          callerSignal,
          "abort",
          onCallerAbort,
        );
      }
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onCallerAbort = () => {
      controller.abort();
      finish(() => reject(new Error(`${label} cancelled`)));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new Error(`${label} deadline exceeded`)));
    }, timeout);
    if (callerSignal !== undefined) {
      EventTarget.prototype.addEventListener.call(
        callerSignal,
        "abort",
        onCallerAbort,
        { once: true },
      );
      if (isAborted(callerSignal)) onCallerAbort();
    }
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
