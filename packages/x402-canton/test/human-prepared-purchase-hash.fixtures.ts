import {
  createHumanPreparedPurchaseObserver,
  type HumanPreparedPurchaseObservation,
} from "../src/human-prepared-purchase-observation.js";
import type { HumanPurchasePrepareRequest } from "../src/human-purchase-command-types.js";
import type { HumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import { recomputeWalletPreparedHashPrecheck } from "../src/prepared-purchase-wallet-precheck.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  humanPreparedPurchaseCommandInputsWithWindow,
} from "./human-prepared-purchase.fixtures.js";
import type { HumanPurchaseFixtureOptions } from "./human-purchase-commitment.fixtures.js";

function response(
  transaction: Uint8Array,
  participantDigest: Uint8Array,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash:
        Buffer.from(participantDigest).toString("base64"),
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

export async function humanPreparedHashInputs(
  participantDigest?: Uint8Array,
): Promise<
  Readonly<{
    digest: Uint8Array;
    intent: HumanPurchaseLedgerIntent;
    observation: HumanPreparedPurchaseObservation;
    precheckDigest: Uint8Array;
    request: HumanPurchasePrepareRequest;
    transaction: Uint8Array;
  }>
> {
  return preparedHashInputs(
    await humanPreparedPurchaseCommandInputs(),
    participantDigest,
  );
}

export async function humanPreparedHashInputsForPurchase(
  options: HumanPurchaseFixtureOptions,
): ReturnType<typeof humanPreparedHashInputs> {
  return preparedHashInputs(await humanPreparedPurchaseCommandInputs(options));
}

export async function humanPreparedHashInputsWithWindow(
  seconds: number,
): ReturnType<typeof humanPreparedHashInputs> {
  return preparedHashInputs(
    await humanPreparedPurchaseCommandInputsWithWindow(seconds),
  );
}

async function preparedHashInputs(
  input: Awaited<ReturnType<typeof humanPreparedPurchaseCommandInputs>>,
  participantDigest?: Uint8Array,
): ReturnType<typeof humanPreparedHashInputs> {
  const { intent, request } = input;
  const transaction = humanPreparedPurchaseBytes(intent, request);
  const precheckDigest = await recomputeWalletPreparedHashPrecheck(transaction);
  const digest = participantDigest ?? precheckDigest;
  const observation = await createHumanPreparedPurchaseObserver(async () =>
    response(transaction, digest),
  )(request);
  return {
    digest,
    intent,
    observation,
    precheckDigest,
    request,
    transaction,
  };
}
