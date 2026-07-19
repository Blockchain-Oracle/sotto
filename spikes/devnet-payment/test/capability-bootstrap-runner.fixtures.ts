import { vi } from "vitest";
import type { CapabilityBootstrapCompletion } from "../src/capability-bootstrap-completion.js";

export function capabilityBootstrapPersistence() {
  const readCompletion = vi.fn<() => Promise<CapabilityBootstrapCompletion>>(
    async () => ({
      classification: "SUCCEEDED",
      completionOffset: 42,
      updateId: `1220${"b".repeat(64)}`,
    }),
  );
  return {
    persistCompletionCursor: vi.fn(async () => undefined),
    persistIntent: vi.fn(async () => undefined),
    persistSubmissionStarted: vi.fn(async () => undefined),
    readCompletion,
    readLedgerEndOffset: vi.fn(async () => 41),
  };
}
