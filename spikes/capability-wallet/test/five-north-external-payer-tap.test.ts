import { describe, expect, it } from "vitest";
import {
  mutatePreparedTap,
  preparedTapFixture,
  TAP_AMOUNT,
  TAP_PAYER,
  TAP_SYNCHRONIZER,
} from "./five-north-external-payer-tap.fixtures.js";

async function moduleUnderTest() {
  try {
    return await import("../src/five-north-external-payer-tap-prepared.js");
  } catch (cause) {
    throw new Error("FIVE_NORTH_EXTERNAL_PAYER_TAP_NOT_IMPLEMENTED", { cause });
  }
}

describe("Five North external payer DevNet tap verifier", () => {
  it("accepts only the observed one-root payer tap effect", async () => {
    const { verifyFiveNorthExternalPayerTapPrepared } = await moduleUnderTest();

    expect(
      verifyFiveNorthExternalPayerTapPrepared({
        amount: TAP_AMOUNT,
        payerParty: TAP_PAYER,
        preparedTransaction: preparedTapFixture(),
        synchronizerId: TAP_SYNCHRONIZER,
      }),
    ).toEqual({
      amount: TAP_AMOUNT,
      createdHoldingCount: 1,
      payerParty: TAP_PAYER,
      synchronizerId: TAP_SYNCHRONIZER,
      version: "sotto-five-north-external-payer-tap-v1",
    });
  });

  it("accepts the participant protocol-version suffix on the exact synchronizer", async () => {
    const { verifyFiveNorthExternalPayerTapPrepared } = await moduleUnderTest();
    const preparedTransaction = mutatePreparedTap((prepared) => {
      prepared.metadata!.synchronizerId = `${TAP_SYNCHRONIZER}::35-3`;
    });

    expect(() =>
      verifyFiveNorthExternalPayerTapPrepared({
        amount: TAP_AMOUNT,
        payerParty: TAP_PAYER,
        preparedTransaction,
        synchronizerId: TAP_SYNCHRONIZER,
      }),
    ).not.toThrow();
  });
});
