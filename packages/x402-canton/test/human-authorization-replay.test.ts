import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVE_HUMAN_AUTHORIZATIONS,
  createHumanAuthorizationReplayStore,
} from "../src/human-authorization-replay.js";

const BASE = Date.parse("2026-07-16T15:00:00.000Z");
const expiry = (milliseconds: number) =>
  new Date(BASE + milliseconds).toISOString();

describe("bounded human authorization replay state", () => {
  it("accepts the exact capacity and fails closed at plus one", () => {
    let now = BASE;
    const store = createHumanAuthorizationReplayStore({
      capacity: 2,
      clock: () => now,
    });
    store.reserve("authorization-1", "commitment-1", expiry(10_000));
    store.reserve("authorization-2", "commitment-2", expiry(10_000));

    expect(store.activeCount()).toBe(2);
    expect(() =>
      store.reserve("authorization-3", "commitment-3", expiry(10_000)),
    ).toThrow(/capacity/iu);
    expect(store.activeCount()).toBe(2);

    now = BASE + 15_000;
    expect(() =>
      store.reserve("authorization-3", "commitment-3", expiry(30_000)),
    ).not.toThrow();
    expect(store.activeCount()).toBe(1);
  });

  it("retains duplicates until expiry plus rollback tolerance", () => {
    let now = BASE;
    const store = createHumanAuthorizationReplayStore({
      capacity: 2,
      clock: () => now,
    });
    store.reserve("authorization-1", "commitment-1", expiry(10_000));

    now = BASE + 14_999;
    expect(() =>
      store.reserve("authorization-1", "commitment-2", expiry(30_000)),
    ).toThrow(/already bound/iu);
    now = BASE + 15_000;
    expect(() =>
      store.reserve("authorization-1", "commitment-2", expiry(30_000)),
    ).not.toThrow();
  });

  it("accepts a five-second clock rollback and rejects plus one", () => {
    let now = BASE;
    const store = createHumanAuthorizationReplayStore({
      capacity: 3,
      clock: () => now,
    });
    store.reserve("authorization-1", "commitment-1", expiry(30_000));
    now = BASE - 5_000;
    store.reserve("authorization-2", "commitment-2", expiry(30_000));
    now = BASE - 5_001;

    expect(() =>
      store.reserve("authorization-3", "commitment-3", expiry(30_000)),
    ).toThrow(/clock moved backwards/iu);
    expect(store.activeCount()).toBe(2);
  });

  it("rejects invalid expiry without reserving the authorization", () => {
    const store = createHumanAuthorizationReplayStore({
      capacity: 1,
      clock: () => BASE,
    });
    expect(() =>
      store.reserve("authorization-1", "commitment-1", "not-a-time"),
    ).toThrow(/expiry/iu);
    expect(store.activeCount()).toBe(0);
  });

  it("pins the production active authorization ceiling", () => {
    expect(MAX_ACTIVE_HUMAN_AUTHORIZATIONS).toBe(4_096);
  });
});
