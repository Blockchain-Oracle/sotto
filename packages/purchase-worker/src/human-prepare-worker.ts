import {
  buildHumanPurchasePrepareRequest,
  createHumanPreparedPurchaseObserver,
  createHumanPurchaseHoldingObserver,
  createHumanTransferFactoryObserver,
  projectHumanPreparedPurchaseApproval,
  verifyHumanPreparedPurchaseHash,
  type AuthenticatedHumanWalletConnectorPreflight,
} from "@sotto/x402-canton";
import {
  createHumanPrepareLeaseDeadline,
  HUMAN_PREPARE_WORKER_LEASE_MS,
  requireCallerActive,
  runWithinHumanPrepareDeadline,
} from "./human-prepare-worker-deadline.js";
import {
  HumanPrepareWorkerError,
  type HumanPrepareWorker,
  type HumanPrepareWorkerDependencies,
} from "./human-prepare-worker-types.js";
import { registerHumanPrepareWorkerResult } from "./human-prepare-worker-result-state.js";

function validateDependencies(input: HumanPrepareWorkerDependencies) {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.repository?.claimHumanPrepareAuthority !== "function" ||
    typeof input.repository?.completeHumanPrepare !== "function" ||
    typeof input.resolveAuthority !== "function" ||
    typeof input.createReaders !== "function" ||
    typeof input.recomputeOfficialHash !== "function"
  ) {
    throw new Error("human prepare worker dependencies are invalid");
  }
  return input;
}

function workerFailure(
  error: unknown,
  caller?: AbortSignal,
  lease?: AbortSignal,
): never {
  if (error instanceof HumanPrepareWorkerError) throw error;
  if (caller?.aborted === true) {
    throw new HumanPrepareWorkerError("HUMAN_PREPARE_CANCELLED");
  }
  if (lease?.aborted === true) {
    throw new HumanPrepareWorkerError("HUMAN_PREPARE_LEASE_EXPIRED");
  }
  throw new HumanPrepareWorkerError("HUMAN_PREPARE_FAILED");
}

export function createHumanPrepareWorker(
  candidate: HumanPrepareWorkerDependencies,
): HumanPrepareWorker {
  const dependencies = validateDependencies(candidate);
  const runOne: HumanPrepareWorker["runOne"] = async (input) => {
    requireCallerActive(input?.signal);
    let preflight: AuthenticatedHumanWalletConnectorPreflight | undefined;
    let claim: Awaited<
      ReturnType<typeof dependencies.repository.claimHumanPrepareAuthority>
    >;
    let restoreLeaseSignal: AbortSignal | undefined;
    try {
      claim = await dependencies.repository.claimHumanPrepareAuthority({
        leaseOwner: input.leaseOwner,
        leaseMilliseconds: HUMAN_PREPARE_WORKER_LEASE_MS,
        resolve: async (resolution, scope, lease) => {
          requireCallerActive(input.signal);
          const restoreDeadline = createHumanPrepareLeaseDeadline(
            lease,
            input.signal,
          );
          restoreLeaseSignal = restoreDeadline.signal;
          let restored;
          try {
            restored = await runWithinHumanPrepareDeadline(
              restoreDeadline,
              async () =>
                await dependencies.resolveAuthority(
                  resolution,
                  scope,
                  Object.freeze({ signal: restoreDeadline.signal }),
                ),
            );
          } finally {
            restoreDeadline.dispose();
          }
          requireCallerActive(input.signal);
          if (preflight !== undefined) {
            throw new Error("human prepare authority resolved more than once");
          }
          preflight = restored.walletPreflight;
          return restored;
        },
      });
    } catch (error) {
      workerFailure(error, input.signal, restoreLeaseSignal);
    }
    requireCallerActive(input.signal);
    if (claim === null) return Object.freeze({ outcome: "idle" as const });
    if (preflight === undefined) {
      throw new HumanPrepareWorkerError("HUMAN_PREPARE_FAILED");
    }
    const deadline = createHumanPrepareLeaseDeadline(claim.lease, input.signal);
    let completionStarted = false;
    try {
      deadline.requireActive();
      const readers = dependencies.createReaders(claim.intent);
      const holdings = await createHumanPurchaseHoldingObserver(
        readers.holdings,
      )(claim.intent, { signal: deadline.signal });
      deadline.requireActive();
      const registry = await createHumanTransferFactoryObserver(
        readers.registry,
      )(claim.intent, holdings, { signal: deadline.signal });
      deadline.requireActive();
      const request = buildHumanPurchasePrepareRequest(
        claim.intent,
        holdings,
        registry,
      );
      const observation = await createHumanPreparedPurchaseObserver(
        readers.prepared,
      )(request, { signal: deadline.signal });
      deadline.requireActive();
      const prepared = await verifyHumanPreparedPurchaseHash(
        observation,
        { recomputeOfficialHash: dependencies.recomputeOfficialHash },
        { signal: deadline.signal },
      );
      const handoffApproval = projectHumanPreparedPurchaseApproval(prepared);
      deadline.requireActive();
      completionStarted = true;
      const checkpoint = await dependencies.repository.completeHumanPrepare({
        lease: claim.lease,
        prepared,
      });
      const result = Object.freeze({
        outcome: "prepared-hash-verified" as const,
        checkpoint,
        approval: handoffApproval,
        handoff: Object.freeze({ preflight, prepared }),
      });
      registerHumanPrepareWorkerResult(result);
      return result;
    } catch (error) {
      if (completionStarted) {
        throw new HumanPrepareWorkerError("HUMAN_PREPARE_FAILED");
      }
      workerFailure(error, input.signal, deadline.signal);
    } finally {
      deadline.dispose();
    }
  };
  return Object.freeze({ runOne });
}
