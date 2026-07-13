import { describe, expect, it } from "vitest";
import { commitBoundedPurchase } from "../src/index.js";
import { PAYER, createPurchaseInput } from "./purchase-commitment.fixtures.js";
import { validLedgerMutations } from "./purchase-commitment-ledger-mutations.js";
import { validRequestMutations } from "./purchase-commitment-request-mutations.js";

describe("sotto-purchase-v2 mutation coverage", () => {
  it.each([...validRequestMutations, ...validLedgerMutations])(
    "changes the commitment for %s",
    (_name, mutate) => {
      const input = createPurchaseInput();
      const baseline = commitBoundedPurchase(input);
      const changed = commitBoundedPurchase(mutate(input));
      expect(changed.commitment).not.toBe(baseline.commitment);
    },
  );

  it("changes both attempt and purchase identity for a new authorization instance", () => {
    const input = createPurchaseInput();
    const first = commitBoundedPurchase(input);
    const second = commitBoundedPurchase({
      ...input,
      authorizationInstanceId: "authorization-8",
    });
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(second.commitment).not.toBe(first.commitment);
  });

  it("keeps payer carrier mutation coupled", () => {
    const input = createPurchaseInput();
    expect(() =>
      commitBoundedPurchase({ ...input, payerParty: `${PAYER}-other` }),
    ).toThrow("fee payer");
  });
});
