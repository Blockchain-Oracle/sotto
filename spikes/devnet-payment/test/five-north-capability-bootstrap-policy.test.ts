import { commitResourceRoute } from "@sotto/x402-canton";
import { describe, expect, it } from "vitest";

const suffix = `::1220${"a".repeat(64)}`;
const input = {
  agentParty: `sotto-agent${suffix}`,
  nowMilliseconds: Date.parse("2026-07-14T10:00:00.000Z"),
  payerParty: `sotto-payer${suffix}`,
  providerParty: `sotto-provider${suffix}`,
  resourceUrl: "https://provider.example.test/paid?private=yes",
} as const;

async function moduleUnderTest() {
  try {
    return await import("../src/five-north-capability-bootstrap-policy.js");
  } catch (error) {
    throw new Error("LEAST_AUTHORITY_POLICY_NOT_IMPLEMENTED", {
      cause: error,
    });
  }
}

describe("Five North least-authority bootstrap policy", () => {
  it("freezes the exact one-hour 0.25/0.325 CC policy", async () => {
    const { buildFiveNorthLeastAuthorityCapabilityPolicy } =
      await moduleUnderTest();

    const policy = buildFiveNorthLeastAuthorityCapabilityPolicy(input);

    expect(policy).toEqual({
      agentParty: input.agentParty,
      allowedRecipient: input.providerParty,
      allowedResourceHash: commitResourceRoute(input.resourceUrl),
      expiresAt: "2026-07-14T11:00:00.000Z",
      maximumTotalDebitAtomic: "3250000000",
      payerParty: input.payerParty,
      perCallLimitAtomic: "2500000000",
      remainingAllowanceAtomic: "3250000000",
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("rejects caller-selected policy fields", async () => {
    const { buildFiveNorthLeastAuthorityCapabilityPolicy } =
      await moduleUnderTest();

    expect(() =>
      buildFiveNorthLeastAuthorityCapabilityPolicy({
        ...input,
        remainingAllowanceAtomic: "10000000000",
      } as never),
    ).toThrow(/keys/iu);
    expect(() =>
      buildFiveNorthLeastAuthorityCapabilityPolicy({
        ...input,
        lifetimeMilliseconds: 86_400_000,
      } as never),
    ).toThrow(/keys/iu);
  });

  it.each([Number.NaN, -1, Number.MAX_SAFE_INTEGER])(
    "rejects unsafe clock %s",
    async (nowMilliseconds) => {
      const { buildFiveNorthLeastAuthorityCapabilityPolicy } =
        await moduleUnderTest();

      expect(() =>
        buildFiveNorthLeastAuthorityCapabilityPolicy({
          ...input,
          nowMilliseconds,
        }),
      ).toThrow(/clock/iu);
    },
  );
});
