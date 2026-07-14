import { describe, expect, it, vi } from "vitest";
import { commitResourceRoute } from "@sotto/x402-canton";
import { runFiveNorthBootstrapFactoryProbe } from "../src/five-north-bootstrap-factory-probe.js";

const suffix = `::1220${"a".repeat(64)}`;
const payerParty = `sotto-payer${suffix}`;
const agentParty = `sotto-agent${suffix}`;
const providerParty = `sotto-provider${suffix}`;
const resourceUrl = "https://provider.example.test/paid?ignored=yes";

describe("Five North bootstrap factory live probe", () => {
  it("returns only a redacted read-only result", async () => {
    const readiness = Object.freeze({ kind: "opaque-readiness" });
    const factory = Object.freeze({
      kind: "opaque-factory",
      observedAt: "2026-07-13T23:30:01.000Z",
    });
    const observeReadiness = vi.fn(async () => readiness as never);
    const observeFactory = vi.fn(async () => factory as never);

    const result = await runFiveNorthBootstrapFactoryProbe({
      agentParty,
      nowMilliseconds: Date.parse("2026-07-13T23:30:00.000Z"),
      observeFactory,
      observeReadiness,
      payerParty,
      providerParty,
      resourceUrl,
    });

    expect(observeReadiness).toHaveBeenCalledWith({
      agentParty,
      payerParty,
    });
    expect(observeFactory).toHaveBeenCalledWith(readiness, {
      agentParty,
      allowedRecipient: providerParty,
      allowedResourceHash: commitResourceRoute(resourceUrl),
      expiresAt: "2026-07-14T00:30:00.000Z",
      maximumTotalDebitAtomic: "3250000000",
      payerParty,
      perCallLimitAtomic: "2500000000",
      remainingAllowanceAtomic: "3250000000",
    });
    expect(result).toEqual({
      authenticated: true,
      factoryAuthority: "direct-pinned-disclosure",
      mutation: false,
      observedAt: "2026-07-13T23:30:01.000Z",
      status: "factory-observed",
    });
    expect(JSON.stringify(result)).not.toContain(payerParty);
    expect(JSON.stringify(result)).not.toContain(resourceUrl);
    expect(JSON.stringify(result)).not.toContain("sha256:");
  });
});
