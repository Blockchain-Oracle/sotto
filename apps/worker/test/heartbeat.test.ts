import { describe, expect, it } from "vitest";
import {
  createHeartbeatLoop,
  createWorkerHeartbeat,
  WORKER_HEARTBEAT_UPSERT,
} from "../src/heartbeat.js";

const STARTED_AT = "2026-07-19T10:00:00.000Z";
const BEAT_AT = "2026-07-19T10:00:02.000Z";

function fakeClient() {
  const queries: Array<{ text: string; values: ReadonlyArray<string> }> = [];
  return {
    queries,
    client: {
      query: async (text: string, values: ReadonlyArray<string>) => {
        queries.push({ text, values });
        return { rowCount: 1 };
      },
    },
  };
}

describe("worker heartbeat", () => {
  it("upserts one sotto.worker_heartbeats row keyed by worker ID", async () => {
    const { client, queries } = fakeClient();
    const heartbeat = createWorkerHeartbeat({
      client,
      workerId: "lease-owner-a",
      kind: "sotto-worker",
      sourceCommit: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
      startedAt: STARTED_AT,
      now: () => new Date(BEAT_AT),
    });
    await heartbeat.beat();
    expect(queries).toHaveLength(1);
    const sql = queries[0]!.text.replace(/\s+/gu, " ").trim();
    expect(sql).toContain("INSERT INTO sotto.worker_heartbeats");
    expect(sql).toContain(
      "(worker_id, kind, source_commit, started_at, beat_at)",
    );
    expect(sql).toContain("ON CONFLICT (worker_id) DO UPDATE SET");
    expect(sql).toContain("beat_at = excluded.beat_at");
    expect(queries[0]!.text).toBe(WORKER_HEARTBEAT_UPSERT);
    expect(queries[0]!.values).toEqual([
      "lease-owner-a",
      "sotto-worker",
      "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
      STARTED_AT,
      BEAT_AT,
    ]);
  });

  it("beats once per supervised tick and stays idle", async () => {
    const { client, queries } = fakeClient();
    const loop = createHeartbeatLoop(
      createWorkerHeartbeat({
        client,
        workerId: "lease-owner-a",
        kind: "sotto-worker",
        sourceCommit: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
        startedAt: STARTED_AT,
      }),
    );
    await expect(loop.runStep(new AbortController().signal)).resolves.toBe(
      "idle",
    );
    expect(queries).toHaveLength(1);
  });

  it.each([
    ["worker ID", { workerId: " padded " }],
    ["kind", { kind: "" }],
    ["source commit", { sourceCommit: "x".repeat(300) }],
    ["start time", { startedAt: "not-a-time" }],
  ])("rejects invalid %s fail-closed", (_label, override) => {
    const { client } = fakeClient();
    expect(() =>
      createWorkerHeartbeat({
        client,
        workerId: "lease-owner-a",
        kind: "sotto-worker",
        sourceCommit: "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56",
        startedAt: STARTED_AT,
        ...override,
      }),
    ).toThrowError("worker heartbeat");
  });
});
