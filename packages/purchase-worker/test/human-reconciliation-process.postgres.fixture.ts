import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const MAXIMUM_OUTPUT_BYTES = 65_536;

type ChildEvent = Readonly<Record<string, unknown> & { event: string }>;

export function reconciliationDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => (resolve = complete));
  return { promise, resolve };
}

export async function withinReconciliationTest<T>(
  promise: Promise<T>,
  label: string,
): Promise<T> {
  return await Promise.race([
    promise,
    delay(2_000).then(() => {
      throw new Error(label);
    }),
  ]);
}

function childEnvironment(input: ReconciliationChildInput): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    ["HOME", "PATH", "TMPDIR"].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return {
    ...environment,
    SOTTO_RECONCILIATION_ATTEMPT_ID: input.attemptId,
    SOTTO_RECONCILIATION_CHILD_MODE: input.mode,
    SOTTO_RECONCILIATION_DATABASE_URL: input.databaseUrl,
    SOTTO_RECONCILIATION_ENDPOINT: input.endpoint,
    SOTTO_RECONCILIATION_LEASE_OWNER: input.leaseOwner,
    ...(input.poolProbeAttemptId === undefined
      ? {}
      : { SOTTO_RECONCILIATION_POOL_PROBE: input.poolProbeAttemptId }),
  };
}

export type ReconciliationChildInput = Readonly<{
  attemptId: string;
  databaseUrl: string;
  endpoint: string;
  leaseOwner: string;
  mode: "normal" | "pool-probe" | "hang-after-terminal";
  poolProbeAttemptId?: string;
}>;

export function startReconciliationChild(input: ReconciliationChildInput) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("./human-reconciliation-worker.child.ts", import.meta.url),
      ),
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env: childEnvironment(input),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const events: ChildEvent[] = [];
  const waiters = new Set<() => void>();
  let stdout = "";
  let outputBytes = 0;
  let oversized = false;
  const notify = () => {
    for (const waiter of waiters) waiter();
    waiters.clear();
  };
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > MAXIMUM_OUTPUT_BYTES) {
      oversized = true;
      child.kill("SIGKILL");
      return;
    }
    stdout += chunk.toString("utf8");
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") continue;
      const value = JSON.parse(line) as ChildEvent;
      if (typeof value.event !== "string") {
        child.kill("SIGKILL");
        return;
      }
      events.push(Object.freeze(value));
      notify();
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > MAXIMUM_OUTPUT_BYTES) {
      oversized = true;
      child.kill("SIGKILL");
    }
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      notify();
      resolve(code);
    });
  });
  const waitFor = async (event: string): Promise<ChildEvent> => {
    while (true) {
      const current = events.find((candidate) => candidate.event === event);
      if (current !== undefined) return current;
      const code = child.exitCode;
      if (code !== null) {
        throw new Error("reconciliation child event is absent");
      }
      await new Promise<void>((resolve) => waiters.add(resolve));
    }
  };
  const result = async (): Promise<unknown> => {
    const event = await waitFor("result");
    const code = await closed;
    if (oversized || code !== 0) {
      throw new Error("reconciliation child process failed");
    }
    return event.result;
  };
  return Object.freeze({
    closed,
    kill: () => child.kill("SIGKILL"),
    result,
    waitFor,
  });
}
