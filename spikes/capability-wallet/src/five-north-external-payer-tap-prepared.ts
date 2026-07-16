import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import { preparedSynchronizerMatches } from "@sotto/x402-canton";
import { verifyFiveNorthExternalPayerTapEffects } from "./five-north-external-payer-tap-effects.js";
import { verifyFiveNorthExternalPayerTapInputs } from "./five-north-external-payer-tap-inputs.js";
import type {
  FiveNorthExternalPayerTapInput,
  FiveNorthExternalPayerTapVerification,
} from "./five-north-external-payer-tap-types.js";

const MAX_PREPARED_BYTES = 2 * 1024 * 1024;
const IDENTIFIER = /^[\x21-\x7e]{1,512}$/u;
const AMOUNT = /^(?:0|[1-9][0-9]{0,20})\.[0-9]{10}$/u;

function exactInput(input: FiveNorthExternalPayerTapInput): void {
  if (
    typeof input !== "object" ||
    input === null ||
    Object.keys(input).sort().join() !==
      "amount,payerParty,preparedTransaction,synchronizerId" ||
    !AMOUNT.test(input.amount) ||
    BigInt(input.amount.replace(".", "")) <= 0n ||
    !IDENTIFIER.test(input.payerParty) ||
    !IDENTIFIER.test(input.synchronizerId) ||
    !(input.preparedTransaction instanceof Uint8Array) ||
    input.preparedTransaction.byteLength === 0 ||
    input.preparedTransaction.byteLength > MAX_PREPARED_BYTES
  ) {
    throw new Error("external payer tap approval input is invalid");
  }
}

export function verifyFiveNorthExternalPayerTapPrepared(
  input: FiveNorthExternalPayerTapInput,
): FiveNorthExternalPayerTapVerification {
  exactInput(input);
  let prepared;
  try {
    prepared = PreparedTransaction.fromBinary(input.preparedTransaction, {
      readUnknownField: "throw",
    });
  } catch (cause) {
    throw new Error("external payer tap prepared transaction is invalid", {
      cause,
    });
  }
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  const transaction = prepared.transaction;
  const metadata = prepared.metadata;
  if (
    !Buffer.from(canonical).equals(Buffer.from(input.preparedTransaction)) ||
    transaction?.version !== "2.1" ||
    transaction.roots.join() !== "0" ||
    transaction.nodes.length !== 4 ||
    transaction.nodeSeeds.length !== 3 ||
    JSON.stringify(
      transaction.nodeSeeds.map(({ nodeId }) => nodeId).sort((a, b) => a - b),
    ) !== "[0,1,3]" ||
    transaction.nodeSeeds.some(({ seed }) => seed.byteLength !== 32) ||
    metadata === undefined ||
    !preparedSynchronizerMatches(
      metadata.synchronizerId,
      input.synchronizerId,
    ) ||
    metadata.submitterInfo?.actAs.join() !== input.payerParty ||
    metadata.globalKeyMapping.length !== 0
  ) {
    throw new Error("external payer tap prepared envelope does not match");
  }
  const effects = verifyFiveNorthExternalPayerTapEffects(transaction, input);
  verifyFiveNorthExternalPayerTapInputs(metadata.inputContracts, effects);
  return Object.freeze({
    amount: input.amount,
    createdHoldingCount: 1,
    payerParty: input.payerParty,
    synchronizerId: input.synchronizerId,
    version: "sotto-five-north-external-payer-tap-v1" as const,
  });
}
