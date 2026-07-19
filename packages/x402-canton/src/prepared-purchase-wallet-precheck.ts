import { hashPreparedTransaction } from "@canton-network/core-tx-visualizer";
import { MAX_PREPARED_TRANSACTION_BYTES } from "./prepared-purchase-observation.js";

/**
 * Fast Apache-licensed parity precheck only. The hash gate still requires an
 * independent official Canton recomputation before this result is trusted.
 */
export async function recomputeWalletPreparedHashPrecheck(
  preparedTransaction: Uint8Array,
): Promise<Uint8Array> {
  if (
    !(preparedTransaction instanceof Uint8Array) ||
    preparedTransaction.byteLength > MAX_PREPARED_TRANSACTION_BYTES
  ) {
    throw new Error("wallet hash precheck input exceeds byte limit");
  }
  const encoded = await hashPreparedTransaction(
    Buffer.from(preparedTransaction).toString("base64"),
    "base64",
  );
  const digest = Buffer.from(encoded, "base64");
  if (digest.byteLength !== 32 || digest.toString("base64") !== encoded) {
    throw new Error("wallet hash precheck returned a noncanonical digest");
  }
  return new Uint8Array(digest);
}
