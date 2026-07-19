import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abortableDelay,
  runSupervisedLoop,
  runSupervisor,
  type WorkerOperationalEvent,
} from "../src/supervisor.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("worker supervisor", () => {
  it("runs steps until aborted and sleeps between idle results", async () => {
    const controller = new AbortController();
    let steps = 0;
    await runSupervisedLoop(
      {
        name: "counting",
        runStep: async () => {
          steps += 1;
          if (steps === 3) controller.abort();
          return "idle";
        },
      },
      {
        signal: controller.signal,
        onEvent: () => undefined,
        idleDelayMilliseconds: 1,
      },
    );
    expect(steps).toBe(3);
  });

  it("logs one operational event per failure and keeps restarting", async () => {
    const controller = new AbortController();
    const events: WorkerOperationalEvent[] = [];
    let steps = 0;
    await runSupervisedLoop(
      {
        name: "flaky",
        runStep: async () => {
          steps += 1;
          if (steps <= 2) throw new Error(`transport refused ${steps}`);
          controller.abort();
          return "progressed";
        },
      },
      {
        signal: controller.signal,
        onEvent: (event) => events.push(event),
        minimumBackoffMilliseconds: 1,
        maximumBackoffMilliseconds: 2,
      },
    );
    expect(steps).toBe(3);
    expect(events).toEqual([
      {
        code: "WORKER_LOOP_ERROR",
        loop: "flaky",
        message: "transport refused 1",
      },
      {
        code: "WORKER_LOOP_ERROR",
        loop: "flaky",
        message: "transport refused 2",
      },
    ]);
  });

  it("applies full jitter between the 1s and 15s default bounds", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let steps = 0;
    const run = runSupervisedLoop(
      {
        name: "jittered",
        runStep: async () => {
          steps += 1;
          throw new Error("always failing");
        },
      },
      {
        signal: controller.signal,
        onEvent: () => undefined,
        random: () => 1,
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(steps).toBe(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(steps).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(steps).toBe(2);
    controller.abort();
    await vi.runAllTimersAsync();
    await run;
  });

  it("resolves promptly when aborted during a backoff wait", async () => {
    const controller = new AbortController();
    const run = runSupervisedLoop(
      {
        name: "stuck",
        runStep: async () => {
          throw new Error("network still down");
        },
      },
      {
        signal: controller.signal,
        onEvent: () => controller.abort(),
        minimumBackoffMilliseconds: 60_000,
        maximumBackoffMilliseconds: 60_000,
      },
    );
    await expect(run).resolves.toBeUndefined();
  });

  it("swallows failures that race a shutdown abort", async () => {
    const controller = new AbortController();
    const events: WorkerOperationalEvent[] = [];
    await runSupervisedLoop(
      {
        name: "racing",
        runStep: async () => {
          controller.abort();
          throw new Error("interrupted by shutdown");
        },
      },
      { signal: controller.signal, onEvent: (event) => events.push(event) },
    );
    expect(events).toEqual([]);
  });

  it("hosts every loop under one supervisor and drains on abort", async () => {
    const controller = new AbortController();
    const seen = new Set<string>();
    const loop = (name: string) => ({
      name,
      runStep: async () => {
        seen.add(name);
        if (seen.size === 2) controller.abort();
        return "idle" as const;
      },
    });
    await runSupervisor([loop("first"), loop("second")], {
      signal: controller.signal,
      onEvent: () => undefined,
      idleDelayMilliseconds: 1,
    });
    expect(seen).toEqual(new Set(["first", "second"]));
  });

  it("rejects duplicate loop names", async () => {
    const controller = new AbortController();
    const loop = {
      name: "duplicated",
      runStep: async () => "idle" as const,
    };
    await expect(
      runSupervisor([loop, loop], {
        signal: controller.signal,
        onEvent: () => undefined,
      }),
    ).rejects.toThrowError("worker loop names must be unique");
  });

  it("abortable delays resolve immediately once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      abortableDelay(60_000, controller.signal),
    ).resolves.toBeUndefined();
  });
});
