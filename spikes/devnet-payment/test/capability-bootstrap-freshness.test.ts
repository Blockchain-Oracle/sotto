import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import { runBoundedCapabilityBootstrap } from "../src/capability-bootstrap-runner.js";

const now = Date.parse("2026-07-13T19:30:00.000Z");
const input = {
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-13T20:30:00.000Z",
  instrument: { admin: "DSO::1220dso", id: "Amulet" },
  maximumTotalDebitAtomic: "3250000000",
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

describe("capability bootstrap authority freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  it("rejects stale authority before the durable submission marker", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const submit = vi.fn();
    const persistSubmissionStarted = vi.fn(async () => undefined);
    const readActiveCapabilities = vi.fn(async () => {
      vi.setSystemTime(now + 60_001);
      return [];
    });

    await expect(
      runBoundedCapabilityBootstrap({
        persistCompletionCursor: vi.fn(async () => undefined),
        persistIntent: vi.fn(async () => undefined),
        persistSubmissionStarted,
        readActiveCapabilities,
        readCompletion: vi.fn(),
        readLedgerEndOffset: vi.fn(async () => 41),
        request,
        submit,
      }),
    ).rejects.toThrow("bootstrap authority is stale");
    expect(persistSubmissionStarted).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects authority that becomes stale after the marker", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const submit = vi.fn();
    const persistSubmissionStarted = vi.fn(async () => {
      vi.setSystemTime(now + 60_001);
    });

    await expect(
      runBoundedCapabilityBootstrap({
        persistCompletionCursor: vi.fn(async () => undefined),
        persistIntent: vi.fn(async () => undefined),
        persistSubmissionStarted,
        readActiveCapabilities: vi.fn(async () => []),
        readCompletion: vi.fn(),
        readLedgerEndOffset: vi.fn(async () => 41),
        request,
        submit,
      }),
    ).rejects.toThrow("bootstrap authority is stale");
    expect(persistSubmissionStarted).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
