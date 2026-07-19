import type { WorkerLoop } from "./supervisor.js";

export type HeartbeatQueryClient = Readonly<{
  query(text: string, values: ReadonlyArray<string>): Promise<unknown>;
}>;

export type WorkerHeartbeatInput = Readonly<{
  client: HeartbeatQueryClient;
  workerId: string;
  kind: string;
  sourceCommit: string;
  startedAt: string;
  now?: () => Date;
}>;

export const WORKER_HEARTBEAT_UPSERT = `
  INSERT INTO sotto.worker_heartbeats
    (worker_id, kind, source_commit, started_at, beat_at)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (worker_id) DO UPDATE SET
    kind = excluded.kind,
    source_commit = excluded.source_commit,
    started_at = excluded.started_at,
    beat_at = excluded.beat_at
`;

function requireBoundedText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > 255
  ) {
    throw new Error(`worker heartbeat ${label} is invalid`);
  }
  return value;
}

function requireInstant(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`worker heartbeat ${label} is invalid`);
  }
  return value;
}

export type WorkerHeartbeat = Readonly<{ beat(): Promise<void> }>;

export function createWorkerHeartbeat(
  input: WorkerHeartbeatInput,
): WorkerHeartbeat {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.client?.query !== "function"
  ) {
    throw new Error("worker heartbeat client is invalid");
  }
  const workerId = requireBoundedText(input.workerId, "worker ID");
  const kind = requireBoundedText(input.kind, "kind");
  const sourceCommit = requireBoundedText(input.sourceCommit, "source commit");
  const startedAt = requireInstant(input.startedAt, "start time");
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    beat: async () => {
      const beatAt = now().toISOString();
      await input.client.query(WORKER_HEARTBEAT_UPSERT, [
        workerId,
        kind,
        sourceCommit,
        startedAt,
        beatAt,
      ]);
    },
  });
}

/** Heartbeat as a supervised loop: one upsert per tick, then idle. */
export function createHeartbeatLoop(heartbeat: WorkerHeartbeat): WorkerLoop {
  return Object.freeze({
    name: "heartbeat",
    runStep: async () => {
      await heartbeat.beat();
      return "idle" as const;
    },
  });
}
