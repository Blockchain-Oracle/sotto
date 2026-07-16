import {
  getPublicKeyFromPrivate,
  SDK,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { timingSafeEqual } from "node:crypto";
import {
  markExternalPayerTapExecutionStarted,
  requireExternalPayerTapNotSubmitted,
} from "./five-north-external-payer-tap-journal.js";
import { verifyFiveNorthExternalPayerTapPrepared } from "./five-north-external-payer-tap-prepared.js";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";
import { recomputeReferenceWalletPreparedHash } from "./reference-wallet-public-identity.js";
import {
  canonicalTapCompletion,
  canonicalTapExecutionInput,
  decodeTapPreparedResponse,
  type FiveNorthExternalPayerTapRunDependencies,
  type FiveNorthExternalPayerTapRunInput,
  type TapDispatch,
} from "./five-north-external-payer-tap-execution-validation.js";

export type {
  FiveNorthExternalPayerTapRunDependencies,
  FiveNorthExternalPayerTapRunInput,
};

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("external payer tap cancelled");
}

export async function runFiveNorthExternalPayerTap(
  candidate: FiveNorthExternalPayerTapRunInput,
  dependencies: FiveNorthExternalPayerTapRunDependencies,
) {
  const input = canonicalTapExecutionInput(candidate);
  active(input.signal);
  await requireExternalPayerTapNotSubmitted(input.keyFile);
  let dispatch: TapDispatch;
  try {
    dispatch = await dependencies.prepareTap({
      amount: input.amount,
      payerParty: input.payerParty,
      signal: input.signal,
      submissionId: input.submissionId,
      synchronizerId: input.synchronizerId,
    });
  } catch (cause) {
    throw new Error("external payer tap preparation failed", { cause });
  }
  active(input.signal);
  const { participantHash, prepared } = decodeTapPreparedResponse(dispatch);
  try {
    verifyFiveNorthExternalPayerTapPrepared({
      amount: input.amount,
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
      throw new Error("external payer tap recomputed hash is invalid");
    }
    if (!timingSafeEqual(computed, participantHash)) {
      throw new Error("external payer tap prepared hash mismatch");
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
          throw new Error("external payer tap signing key does not match");
        }
        return signTransactionHash(
          participantHash.toString("base64"),
          privateKey,
        );
      },
    );
    active(input.signal);
    await markExternalPayerTapExecutionStarted(input.keyFile, {
      amount: input.amount,
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
      throw new Error("external payer tap execution outcome is uncertain", {
        cause,
      });
    }
    const result = canonicalTapCompletion(executed);
    return Object.freeze({
      amount: input.amount,
      completionOffset: result.completionOffset,
      mutationSubmitted: true as const,
      payerParty: input.payerParty,
      submissionId: input.submissionId,
      synchronizerId: input.synchronizerId,
      updateId: result.updateId,
      version: "sotto-five-north-external-payer-tap-execution-v1" as const,
    });
  } finally {
    prepared.fill(0);
    participantHash.fill(0);
  }
}
