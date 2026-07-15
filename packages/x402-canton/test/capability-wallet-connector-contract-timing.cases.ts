import { expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../src/index.js";
import {
  capabilityWalletContractSessionInput as sessionInput,
  type CapabilityWalletConnectorContractHarness,
  type CapabilityWalletContractProbe,
} from "./capability-wallet-connector-contract-support.js";

type Phase = "approval" | "discovery";

async function reach(probe: CapabilityWalletContractProbe, phase: Phase) {
  for (let attempts = 0; attempts < 4; attempts += 1) {
    if (
      phase === "approval" ? probe.approvalStarted() : probe.discoveryStarted()
    ) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`connector ${phase} did not start`);
}

export function registerCapabilityWalletConnectorTimingCases(
  harness: CapabilityWalletConnectorContractHarness,
): void {
  it.each(["discovery", "approval"] as const)(
    "propagates abort during %s and performs zero signing",
    async (phase) => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ [phase]: "hang" });
      const controller = new AbortController();
      const signing = createCapabilityWalletSigningSession(
        sessionInput(
          harness,
          scenario.connector,
          prepared,
          1_000,
          controller.signal,
        ),
      );
      const cancelled = expect(signing).rejects.toThrow(/cancelled/iu);
      await reach(scenario.probe, phase);
      controller.abort();
      await cancelled;

      const aborted =
        phase === "approval"
          ? scenario.probe.approvalAborted()
          : scenario.probe.discoveryAborted();
      expect(aborted).toBe(true);
      expect(scenario.probe.signCalls()).toBe(0);
    },
  );

  it.each(["discovery", "approval"] as const)(
    "enforces deadline and ignores late %s completion",
    async (phase) => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ [phase]: "hang" });
      const signing = createCapabilityWalletSigningSession(
        sessionInput(harness, scenario.connector, prepared, 10),
      );
      const timedOut = expect(signing).rejects.toThrow(/timed out/iu);
      await reach(scenario.probe, phase);
      await vi.advanceTimersByTimeAsync(11);
      await timedOut;

      const aborted =
        phase === "approval"
          ? scenario.probe.approvalAborted()
          : scenario.probe.discoveryAborted();
      expect(aborted).toBe(true);

      if (phase === "approval") scenario.probe.releaseApproval();
      else scenario.probe.releaseDiscovery();
      await Promise.resolve();
      await Promise.resolve();
      if (phase === "discovery") {
        expect(scenario.probe.approvalStarted()).toBe(false);
      }
      expect(scenario.probe.signCalls()).toBe(0);
    },
  );
}
