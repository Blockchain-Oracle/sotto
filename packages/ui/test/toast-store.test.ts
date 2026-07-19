import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissToast,
  getToasts,
  resetToasts,
  toast,
} from "../src/primitives/toast-store.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetToasts();
  vi.useRealTimers();
});

describe("toast-store", () => {
  it("pushes and dismisses secondary notices", () => {
    const id = toast({ title: "Draft saved", durationMs: 0 });
    expect(getToasts().map((notice) => notice.title)).toEqual(["Draft saved"]);
    dismissToast(id);
    expect(getToasts()).toEqual([]);
  });

  it("auto-dismisses after the given duration", () => {
    toast({ title: "Copied", durationMs: 5000 });
    expect(getToasts().length).toBe(1);
    vi.advanceTimersByTime(5001);
    expect(getToasts()).toEqual([]);
  });

  it("keeps durationMs 0 notices until dismissed", () => {
    toast({ title: "Session key rotated", durationMs: 0, tone: "ambra" });
    vi.advanceTimersByTime(60_000);
    expect(getToasts().length).toBe(1);
  });
});
