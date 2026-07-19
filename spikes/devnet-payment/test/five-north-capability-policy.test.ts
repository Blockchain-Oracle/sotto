import { describe, expect, it } from "vitest";
import { validateFiveNorthCapabilityPolicy } from "../src/five-north-capability-policy.js";

const suffix = `::1220${"a".repeat(64)}`;
const valid = {
  agentParty: `sotto-agent${suffix}`,
  allowedRecipient: `sotto-provider${suffix}`,
  allowedResourceHash: `sha256:${"b".repeat(64)}` as const,
  expiresAt: "2026-07-14T00:30:00.000Z",
  maximumTotalDebitAtomic: "3250000000",
  payerParty: `sotto-payer${suffix}`,
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
} as const;

describe("Five North capability policy", () => {
  it("rejects oversized and malformed Party identifiers before hashing", () => {
    expect(() =>
      validateFiveNorthCapabilityPolicy(
        { ...valid, payerParty: `sotto-${"x".repeat(513)}${suffix}` },
        Date.parse("2026-07-13T23:30:00.000Z"),
      ),
    ).toThrow("bounded exact identifier");
    expect(() =>
      validateFiveNorthCapabilityPolicy(
        { ...valid, payerParty: `sotto-\ud800${suffix}` },
        Date.parse("2026-07-13T23:30:00.000Z"),
      ),
    ).toThrow("bounded exact identifier");
  });

  it("rejects atomic strings beyond the shared 38-digit contract", () => {
    expect(() =>
      validateFiveNorthCapabilityPolicy(
        { ...valid, maximumTotalDebitAtomic: "9".repeat(39) },
        Date.parse("2026-07-13T23:30:00.000Z"),
      ),
    ).toThrow("bounded atomic integer");
  });
});
