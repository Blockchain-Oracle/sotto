import { expect, it, vi } from "vitest";
import { withHumanObservationDeadline } from "../src/human-observation-deadline.js";

it("uses native signal methods despite caller overrides", async () => {
  const controller = new AbortController();
  const signal = controller.signal;
  Object.defineProperty(signal, "addEventListener", {
    value: () => {
      throw new Error("private add secret");
    },
  });
  Object.defineProperty(signal, "removeEventListener", {
    value: () => {
      throw new Error("private remove secret");
    },
  });
  Object.defineProperty(signal, "aborted", {
    get: () => {
      throw new Error("private aborted secret");
    },
  });
  const work = vi.fn(async () => "completed");

  await expect(
    withHumanObservationDeadline(
      "human payer identity",
      10_000,
      { signal },
      work,
    ),
  ).resolves.toBe("completed");
  expect(work).toHaveBeenCalledOnce();
});

it("rejects malformed runtime options asynchronously", async () => {
  const pending = withHumanObservationDeadline(
    "human payer identity",
    10_000,
    null as never,
    async () => "unreachable",
  );

  await expect(pending).rejects.toThrow(
    "human payer identity options are invalid",
  );
});
