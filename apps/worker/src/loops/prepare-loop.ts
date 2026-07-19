import {
  createFiveNorthHumanPurchaseReaders,
  createFiveNorthPrepareTransport,
  recomputeReferenceWalletPreparedHash,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";
import { createHumanPrepareWorker } from "@sotto/purchase-worker";
import type { PurchaseRepository } from "@sotto/database";
import type { SignerClient } from "../signer-client.js";
import type { WorkerLoop } from "../supervisor.js";
import { createExecutionFlow, type ExecutionFlow } from "./execution-flow.js";
import { createPrepareAuthorityResolver } from "./prepare-authority.js";

export type PrepareLoopInput = Readonly<{
  network: FiveNorthNetworkConfig;
  repository: PurchaseRepository;
  signer: SignerClient;
  leaseOwner: string;
  humanWalletPublicKeys: ReadonlyMap<string, Buffer>;
  executionFlow?: ExecutionFlow;
}>;

export type ExecutionOutcomeListener = (
  outcome: Readonly<{ attemptId: string; outcome: string }>,
) => void;

/**
 * One-restartable-worker prepare step (Q-006): claims the next queued
 * human purchase, restores its authority through the signer-service
 * wallet, prepares against real Five North transports, and — while the
 * verified handoff is still in memory — drives the execution flow for the
 * same attempt. All transports are created per step so every retry starts
 * from a clean signal scope.
 */
export function createPrepareLoop(
  input: PrepareLoopInput,
  onExecutionOutcome: ExecutionOutcomeListener = () => undefined,
): WorkerLoop {
  const executionFlow =
    input.executionFlow ??
    createExecutionFlow({
      network: input.network,
      repository: input.repository,
      humanWalletPublicKeys: input.humanWalletPublicKeys,
    });
  return Object.freeze({
    name: "human-prepare",
    runStep: async (signal) => {
      const worker = createHumanPrepareWorker({
        repository: input.repository,
        resolveAuthority: createPrepareAuthorityResolver({
          network: input.network,
          signer: input.signer,
        }),
        createReaders: (intent) =>
          createFiveNorthHumanPurchaseReaders(
            createFiveNorthPrepareTransport(
              input.network,
              intent.challenge.payerParty,
              { signal },
            ),
            intent.challenge.payerParty,
          ),
        recomputeOfficialHash: recomputeReferenceWalletPreparedHash,
      });
      const prepared = await worker.runOne({
        leaseOwner: input.leaseOwner,
        signal,
      });
      if (prepared.outcome === "idle") return "idle";
      const execution = await executionFlow.execute(prepared, signal);
      onExecutionOutcome(
        Object.freeze({
          attemptId: execution.attemptId,
          outcome: execution.outcome,
        }),
      );
      return "progressed";
    },
  });
}
