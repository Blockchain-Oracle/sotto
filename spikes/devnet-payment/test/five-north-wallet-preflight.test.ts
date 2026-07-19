import { describe, expect, it } from "vitest";
import {
  evaluateFiveNorthWalletPreflight,
  type FiveNorthWalletPreflightSnapshot,
} from "../src/five-north-wallet-preflight.js";

const PAYER = "sotto-payer::1220payer";
const AGENT = "sotto-agent::1220agent";

function supportedSnapshot(): FiveNorthWalletPreflightSnapshot {
  return {
    agentParty: AGENT,
    agentPartyVisible: true,
    authenticatedSubject: "wallet-preflight-user",
    executeRouteReachable: true,
    externalPartyTopologySupported: true,
    packageVisible: true,
    preferredPackageConfirmed: true,
    prepareRouteReachable: true,
    rights: [{ kind: "execute-as", party: AGENT }],
    synchronizerConfirmed: true,
  };
}

describe("Five North wallet preflight", () => {
  it("supports only a complete agent-only wallet boundary", () => {
    const result = evaluateFiveNorthWalletPreflight(supportedSnapshot(), {
      agentParty: AGENT,
      payerParty: PAYER,
    });

    expect(result).toMatchObject({
      checks: {
        agentActAsPresent: true,
        agentPartyVisible: true,
        broadAuthorityAbsent: true,
        executeRouteReachable: true,
        externalPartyTopologySupported: true,
        packageVisible: true,
        payerActAsAbsent: true,
        preferredPackageConfirmed: true,
        prepareRouteReachable: true,
        synchronizerConfirmed: true,
      },
      reasons: [],
      verdict: "SUPPORTED",
      version: "sotto-five-north-wallet-preflight-v1",
    });
    expect(result.subjectHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(JSON.stringify(result)).not.toContain("wallet-preflight-user");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checks)).toBe(true);
    expect(Object.isFrozen(result.reasons)).toBe(true);
  });

  it("rejects the current shared-credential authority pattern exactly", () => {
    const snapshot = supportedSnapshot();
    const result = evaluateFiveNorthWalletPreflight(
      {
        ...snapshot,
        rights: [
          { kind: "participant-admin" },
          { kind: "execute-any" },
          { kind: "read-any" },
          { kind: "act-as", party: AGENT },
        ],
      },
      { agentParty: AGENT, payerParty: PAYER },
    );

    expect(result.verdict).toBe("UNSUPPORTED");
    expect(result.checks.payerActAsAbsent).toBe(false);
    expect(result.checks.broadAuthorityAbsent).toBe(false);
    expect(result.reasons).toEqual([
      "BROAD_AUTHORITY_PRESENT",
      "PAYER_AUTHORITY_PRESENT",
    ]);
  });

  it("rejects named payer execution authority without broad rights", () => {
    const snapshot = supportedSnapshot();
    const result = evaluateFiveNorthWalletPreflight(
      {
        ...snapshot,
        rights: [
          { kind: "execute-as", party: AGENT },
          { kind: "execute-as", party: PAYER },
        ],
      },
      { agentParty: AGENT, payerParty: PAYER },
    );

    expect(result.verdict).toBe("UNSUPPORTED");
    expect(result.checks.broadAuthorityAbsent).toBe(true);
    expect(result.checks.payerActAsAbsent).toBe(false);
    expect(result.reasons).toEqual(["PAYER_AUTHORITY_PRESENT"]);
  });

  it("reports every missing live capability using stable reason codes", () => {
    const snapshot = supportedSnapshot();
    const result = evaluateFiveNorthWalletPreflight(
      {
        ...snapshot,
        agentPartyVisible: false,
        executeRouteReachable: false,
        externalPartyTopologySupported: false,
        packageVisible: false,
        preferredPackageConfirmed: false,
        prepareRouteReachable: false,
        rights: [],
        synchronizerConfirmed: false,
      },
      { agentParty: AGENT, payerParty: PAYER },
    );

    expect(result.reasons).toEqual([
      "AGENT_ACT_AS_MISSING",
      "AGENT_PARTY_UNAVAILABLE",
      "EXECUTE_ROUTE_UNREACHABLE",
      "EXTERNAL_PARTY_TOPOLOGY_UNSUPPORTED",
      "PREFERRED_PACKAGE_UNCONFIRMED",
      "PREPARE_ROUTE_UNREACHABLE",
      "SOTTO_PACKAGE_UNAVAILABLE",
      "SYNCHRONIZER_UNCONFIRMED",
    ]);
  });

  it("rejects unknown authority and non-boolean capability claims", () => {
    const snapshot = supportedSnapshot();
    expect(() =>
      evaluateFiveNorthWalletPreflight(
        {
          ...snapshot,
          rights: [
            ...snapshot.rights,
            { kind: "future-participant-admin" } as never,
          ],
        },
        { agentParty: AGENT, payerParty: PAYER },
      ),
    ).toThrow(/right/iu);
    expect(() =>
      evaluateFiveNorthWalletPreflight(
        { ...snapshot, packageVisible: "yes" as never },
        { agentParty: AGENT, payerParty: PAYER },
      ),
    ).toThrow(/boolean/iu);
  });
});
