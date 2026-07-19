import {
  createFiveNorthHumanWalletExecuteTransport,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";
import { createHumanWalletExecutionWorker } from "@sotto/purchase-worker";
import type {
  HumanWalletExecutionPrepared,
  HumanWalletExecutionWorkerResult,
} from "@sotto/purchase-worker";
import type { PurchaseRepository } from "@sotto/database";
import type { HumanWalletSigningDependencies } from "@sotto/x402-canton";

export type ExecutionFlowInput = Readonly<{
  network: FiveNorthNetworkConfig;
  repository: PurchaseRepository;
  humanWalletPublicKeys: ReadonlyMap<string, Buffer>;
}>;

export type ExecutionFlow = Readonly<{
  execute(
    prepared: HumanWalletExecutionPrepared,
    signal: AbortSignal,
  ): Promise<HumanWalletExecutionWorkerResult>;
}>;

/**
 * Registered-public-key lookup for human wallet signature verification.
 * The map holds public registration material only; the signing session
 * recomputes the Canton fingerprint of the returned key and rejects any
 * entry that does not hash to the identity's `signedBy` fingerprint.
 */
export function createRegisteredPublicKeyResolver(
  humanWalletPublicKeys: ReadonlyMap<string, Buffer>,
): HumanWalletSigningDependencies["resolveRegisteredPublicKey"] {
  return async (query, { signal }) => {
    if (signal.aborted) {
      throw new Error("registered public-key lookup cancelled");
    }
    const publicKey = humanWalletPublicKeys.get(query.signedBy);
    if (publicKey === undefined) {
      throw new Error("human wallet public key is not registered");
    }
    return Object.freeze({
      fingerprint: query.signedBy,
      publicKey: publicKey.toString("base64"),
      publicKeyFormat: query.publicKeyFormat,
    });
  };
}

/**
 * Drives one prepared-hash-verified attempt through the proven
 * HumanWalletExecutionWorker. The signer approval handoff, the durable
 * approval-requested transition, and the single signature collection all
 * happen inside the signing session through the signer-service connector
 * embedded in the prepared handoff; this flow wires the real Five North
 * execute transport and the registered-key verifier around it.
 */
export function createExecutionFlow(input: ExecutionFlowInput): ExecutionFlow {
  const resolveRegisteredPublicKey = createRegisteredPublicKeyResolver(
    input.humanWalletPublicKeys,
  );
  return Object.freeze({
    execute: async (prepared, signal) => {
      const worker = createHumanWalletExecutionWorker({
        repository: input.repository,
        resolveRegisteredPublicKey,
        executeTransport: createFiveNorthHumanWalletExecuteTransport(
          input.network,
          { signal },
        ),
      });
      return await worker.runOne({ prepared, signal });
    },
  });
}
