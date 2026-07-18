import {
  buildHumanPurchasePrepareRequest,
  createHumanPreparedPurchaseObserver,
  createHumanPurchaseHoldingObserver,
  createHumanTransferFactoryObserver,
  type HashVerifiedHumanPreparedPurchase,
  type HumanPurchaseLedgerIntent,
  verifyHumanPreparedPurchaseHash,
} from "@sotto/x402-canton";
import { recomputeWalletPreparedHashPrecheck } from "../../x402-canton/src/prepared-purchase-wallet-precheck.js";
import {
  historicalContextFactoryResponse,
  humanPreparedPurchaseBytes,
} from "../../x402-canton/test/human-prepared-purchase.fixtures.js";
import {
  humanHoldingEntry,
  humanHoldingReader,
} from "../../x402-canton/test/human-purchase-holding.fixtures.js";
import { responseBytes } from "../../x402-canton/test/transfer-factory-observation.fixtures.js";

export async function verifiedHumanPrepare(
  intent: HumanPurchaseLedgerIntent,
): Promise<HashVerifiedHumanPreparedPurchase> {
  const holdings = await createHumanPurchaseHoldingObserver(
    humanHoldingReader([
      humanHoldingEntry(
        "00holding-a",
        "0.3250000000",
        intent.challenge.payerParty,
        intent.challenge.synchronizerId,
      ),
    ]),
  )(intent);
  const registry = await createHumanTransferFactoryObserver(async () =>
    responseBytes(historicalContextFactoryResponse(intent)),
  )(intent, holdings);
  const request = buildHumanPurchasePrepareRequest(intent, holdings, registry);
  const transaction = humanPreparedPurchaseBytes(intent, request);
  const digest = await recomputeWalletPreparedHashPrecheck(transaction);
  const response = responseBytes({
    preparedTransaction: Buffer.from(transaction).toString("base64"),
    preparedTransactionHash: Buffer.from(digest).toString("base64"),
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    hashingDetails: null,
    costEstimation: null,
  });
  const observation = await createHumanPreparedPurchaseObserver(
    async () => response,
  )(request);
  return verifyHumanPreparedPurchaseHash(observation, {
    recomputeOfficialHash: async () => digest,
  });
}
