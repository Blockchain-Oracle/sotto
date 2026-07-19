import {
  createFiveNorthHumanReconciliationAdapter,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";
import { createHumanReconciliationWorker } from "@sotto/purchase-worker";
import type { HumanReconciliationRepository } from "@sotto/database";
import type { WorkerLoop } from "../supervisor.js";

export type ReconciliationLoopInput = Readonly<{
  network: FiveNorthNetworkConfig;
  repository: HumanReconciliationRepository;
  leaseOwner: string;
}>;

/**
 * Settlement reconciliation step: claims the next reconciliation job and
 * probes real Five North command completions through the read-only
 * adapter. Pending settlements defer with a checkpoint; terminal outcomes
 * land durably through the reconciliation repository.
 */
export function createReconciliationLoop(
  input: ReconciliationLoopInput,
): WorkerLoop {
  return Object.freeze({
    name: "human-reconciliation",
    runStep: async (signal) => {
      const worker = createHumanReconciliationWorker({
        repository: input.repository,
        readReconciliation: createFiveNorthHumanReconciliationAdapter(
          input.network,
          { signal },
        ),
      });
      const result = await worker.runOne({
        leaseOwner: input.leaseOwner,
        signal,
      });
      return result.outcome === "idle" ? "idle" : "progressed";
    },
  });
}
