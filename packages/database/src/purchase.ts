import {
  projectHumanPurchaseJournalIntent,
  type HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import { exportHumanPrepareAuthorityPlaintext } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import { readPrivatePrepareAuthorityActiveKeyId } from "./private-prepare-authority-keyring.js";
import { initializePurchaseAttempt } from "./purchase-initialize.js";
import { createPurchasePoolRuntime } from "./purchase-pool.js";
import {
  PurchasePersistenceError,
  type PurchaseRepository,
  type PurchaseRepositoryInput,
} from "./purchase-types.js";
import {
  validateHumanPurchaseAttemptInitialization,
  validatePurchaseSourceCommit,
} from "./purchase-validation.js";

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && Buffer.compare(left, right) === 0
  );
}

export function createPurchaseRepository(
  input: PurchaseRepositoryInput,
): PurchaseRepository {
  if (typeof input.resolveHumanPurchaseBinding !== "function") {
    throw new Error("purchase binding resolver is required");
  }
  readPrivatePrepareAuthorityActiveKeyId(input.prepareAuthorityKeyring);
  const sourceCommit = validatePurchaseSourceCommit(input.sourceCommit);
  const runtime = createPurchasePoolRuntime(input);
  const initializeHumanPurchaseAttempt = async (
    candidate: HumanPurchaseLedgerIntent,
  ) => {
    const release = runtime.admit();
    let plaintext: Uint8Array | undefined;
    try {
      const intent = projectHumanPurchaseJournalIntent(candidate);
      plaintext = exportHumanPrepareAuthorityPlaintext(candidate);
      let binding: Awaited<
        ReturnType<typeof input.resolveHumanPurchaseBinding>
      >;
      try {
        binding = await input.resolveHumanPurchaseBinding(intent);
      } catch {
        throw new PurchasePersistenceError();
      }
      const current = projectHumanPurchaseJournalIntent(candidate);
      const currentPlaintext = exportHumanPrepareAuthorityPlaintext(candidate);
      try {
        if (
          JSON.stringify(current) !== JSON.stringify(intent) ||
          !sameBytes(currentPlaintext, plaintext)
        ) {
          throw new PurchasePersistenceError();
        }
      } finally {
        currentPlaintext.fill(0);
      }
      const attempt = validateHumanPurchaseAttemptInitialization(
        current,
        binding,
        sourceCommit,
      );
      return await initializePurchaseAttempt(
        runtime.pool,
        attempt,
        plaintext,
        input.prepareAuthorityKeyring,
      );
    } finally {
      plaintext?.fill(0);
      release();
    }
  };
  return Object.freeze({
    initializeHumanPurchaseAttempt,
    close: runtime.close,
  });
}
