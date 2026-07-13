import { describe, expect, it } from "vitest";
import { matchesLedgerRejection } from "../src/ledger-rejection.js";

describe("matchesLedgerRejection", () => {
  it("requires both the expected status and reason", () => {
    const rejection = new Error(
      "Five North request failed with HTTP 400 (INVALID_ARGUMENT: amount exceeds per-call limit)",
    );

    expect(
      matchesLedgerRejection(rejection, {
        reason: "amount exceeds per-call limit",
        status: 400,
      }),
    ).toBe(true);
    expect(
      matchesLedgerRejection(new Error("request failed with HTTP 400"), {
        reason: "amount exceeds per-call limit",
        status: 400,
      }),
    ).toBe(false);
    expect(
      matchesLedgerRejection(rejection, {
        reason: "attempt was already consumed",
        status: 400,
      }),
    ).toBe(false);
    expect(
      matchesLedgerRejection(rejection, {
        reason: "amount exceeds per-call limit",
        status: 404,
      }),
    ).toBe(false);
  });
});
