import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHumanPreparedPurchaseObserver,
  HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
} from "../src/human-prepared-purchase-observation.js";
import { claimHumanPreparedPurchaseObservation } from "../src/human-prepared-purchase-observation-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  humanPreparedPurchaseCommandInputsWithWindow,
} from "./human-prepared-purchase.fixtures.js";

const participantHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: participantHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

describe("human prepared Purchase private state", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects stale acquisition, rollback, and a lost signing reserve", async () => {
    const stale = await humanPreparedPurchaseCommandInputs();
    await expect(
      createHumanPreparedPurchaseObserver(async () => {
        vi.setSystemTime(Date.now() + HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS + 1);
        return response(
          humanPreparedPurchaseBytes(stale.intent, stale.request),
        );
      })(stale.request),
    ).rejects.toThrow(/stale|deadline/iu);

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const rollback = await humanPreparedPurchaseCommandInputs();
    await expect(
      createHumanPreparedPurchaseObserver(async () => {
        vi.setSystemTime(Date.now() - 5_001);
        return response(
          humanPreparedPurchaseBytes(rollback.intent, rollback.request),
        );
      })(rollback.request),
    ).rejects.toThrow(/clock moved backwards/iu);

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const short = await humanPreparedPurchaseCommandInputsWithWindow(121);
    await expect(
      createHumanPreparedPurchaseObserver(async () => {
        vi.setSystemTime(Date.now() + 1_001);
        return response(
          humanPreparedPurchaseBytes(short.intent, short.request),
        );
      })(short.request),
    ).rejects.toThrow(/signing reserve/iu);
  });

  it("keeps private material isolated and claims it once", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const source = response(humanPreparedPurchaseBytes(intent, request));
    const observation = await createHumanPreparedPurchaseObserver(
      async () => source,
    )(request);
    source.fill(0);

    expect(() =>
      claimHumanPreparedPurchaseObservation({ ...observation }),
    ).toThrow(/not authenticated/iu);
    const claimed = claimHumanPreparedPurchaseObservation(observation);
    expect(claimed.preparedTransaction.byteLength).toBeGreaterThan(0);
    expect(claimed.participantPreparedTransactionHash).toEqual(
      new Uint8Array(32).fill(7),
    );
    expect(claimed.intent).toBe(intent);
    expect(claimed.prepareRequest).toBe(request);
    expect(() => claimHumanPreparedPurchaseObservation(observation)).toThrow(
      /already claimed/iu,
    );
  });

  it("expires unclaimed private material", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const observation = await createHumanPreparedPurchaseObserver(async () =>
      response(humanPreparedPurchaseBytes(intent, request)),
    )(request);
    vi.advanceTimersByTime(10_001);

    expect(() => claimHumanPreparedPurchaseObservation(observation)).toThrow(
      /stale/iu,
    );
  });
});
