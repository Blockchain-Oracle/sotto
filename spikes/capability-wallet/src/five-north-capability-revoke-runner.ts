import {
  getPublicKeyFromPrivate,
  SDK,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { timingSafeEqual } from "node:crypto";
import {
  markCapabilityRevokeExecutionStarted,
  requireCapabilityRevokeNotSubmitted,
} from "./five-north-capability-revoke-journal.js";
import { verifyFiveNorthCapabilityRevokePrepared } from "./five-north-capability-revoke-prepared.js";
import {
  canonicalRevokeCompletion,
  canonicalRevokeRunInput,
  decodeRevokeDispatch,
  type FiveNorthCapabilityRevokeDependencies,
  type FiveNorthCapabilityRevokeRunInput,
  type RevokeDispatch,
} from "./five-north-capability-revoke-validation.js";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";
import { recomputeReferenceWalletPreparedHash } from "./reference-wallet-public-identity.js";

export type {
  FiveNorthCapabilityRevokeDependencies,
  FiveNorthCapabilityRevokeRunInput,
};

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("capability revoke cancelled");
}

export async function runFiveNorthCapabilityRevoke(
  candidate: FiveNorthCapabilityRevokeRunInput,
  dependencies: FiveNorthCapabilityRevokeDependencies,
) {
  const input = canonicalRevokeRunInput(candidate);
  active(input.signal);
  await requireCapabilityRevokeNotSubmitted(input.keyFile);
  let dispatch: RevokeDispatch;
  try {
    dispatch = await dependencies.prepareRevoke({
      capabilityContractId: input.capabilityContractId,
      payerParty: input.payerParty,
      signal: input.signal,
      submissionId: input.submissionId,
      synchronizerId: input.synchronizerId,
    });
  } catch (cause) {
    throw new Error("capability revoke preparation failed", { cause });
  }
  active(input.signal);
  const { participantHash, prepared } = decodeRevokeDispatch(dispatch);
  try {
    verifyFiveNorthCapabilityRevokePrepared({
      agentParty: input.agentParty,
      capabilityContractId: input.capabilityContractId,
      payerParty: input.payerParty,
      preparedTransaction: prepared,
      synchronizerId: input.synchronizerId,
    });
    const computed = Buffer.from(
      await (
        dependencies.recomputePreparedHash ??
        recomputeReferenceWalletPreparedHash
      )(prepared),
    );
    if (computed.length !== 32) {
      computed.fill(0);
      throw new Error("capability revoke recomputed hash is invalid");
    }
    if (!timingSafeEqual(computed, participantHash)) {
      throw new Error("capability revoke prepared hash mismatch");
    }
    active(input.signal);
    const signature = await withReferenceWalletPrivateKey(
      input.keyFile,
      async (key) => {
        active(input.signal);
        const privateKey = key.toString("base64");
        const publicKey = getPublicKeyFromPrivate(privateKey);
        const fingerprint =
          await SDK.createOffline().keys.fingerprint(publicKey);
        if (fingerprint !== input.expectedFingerprint) {
          throw new Error("capability revoke signing key does not match");
        }
        return signTransactionHash(
          participantHash.toString("base64"),
          privateKey,
        );
      },
    );
    active(input.signal);
    await markCapabilityRevokeExecutionStarted(input.keyFile, {
      capabilityContractId: input.capabilityContractId,
      payerParty: input.payerParty,
      preparedHash: `sha256:${computed.toString("hex")}`,
      submissionId: input.submissionId,
      synchronizerId: input.synchronizerId,
    });
    active(input.signal);
    let executed: unknown;
    try {
      executed = await dispatch.execute(signature);
    } catch (cause) {
      throw new Error("capability revoke execution outcome is uncertain", {
        cause,
      });
    }
    const result = canonicalRevokeCompletion(executed);
    return Object.freeze({
      capabilityContractId: input.capabilityContractId,
      completionOffset: result.completionOffset,
      mutationSubmitted: true as const,
      payerParty: input.payerParty,
      submissionId: input.submissionId,
      synchronizerId: input.synchronizerId,
      updateId: result.updateId,
      version: "sotto-five-north-capability-revoke-execution-v1" as const,
    });
  } finally {
    prepared.fill(0);
    participantHash.fill(0);
  }
}
