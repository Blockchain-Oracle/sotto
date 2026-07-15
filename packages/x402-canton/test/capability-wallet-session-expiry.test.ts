import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCapabilityWalletSigningSession,
  type CapabilityWalletConnector,
} from "../src/index.js";
import { claimApprovedCapabilityWalletSigningSession } from "../src/capability-wallet-signing-session.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
  verifiedCapabilityBootstrap,
} from "./capability-wallet-connector.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

async function approvedSession(timeoutMilliseconds = 1_000) {
  const prepared = await verifiedCapabilityBootstrap();
  return createCapabilityWalletSigningSession({
    connector: {
      discover: async () => CONNECTOR_CAPABILITIES,
      requestApproval: async () => APPROVED_SIGNATURE,
    },
    connectorId: CONNECTOR_ID,
    connectorOrigin: CONNECTOR_ORIGIN,
    prepared,
    timeoutMilliseconds,
  });
}

describe("capability wallet session expiry", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("advertises the authenticated authority deadline", async () => {
    const prepared = await verifiedCapabilityBootstrap(() =>
      vi.advanceTimersByTime(1_000),
    );
    const requestApproval = vi.fn(async (request: unknown) => {
      void request;
      return { outcome: "rejected", reason: "user-rejected" };
    });

    await createCapabilityWalletSigningSession({
      connector: {
        discover: async () => CONNECTOR_CAPABILITIES,
        requestApproval,
      },
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      prepared,
      timeoutMilliseconds: 600_000,
    });

    expect(requestApproval.mock.calls[0]![0]).toMatchObject({
      createdAt: "2026-07-15T10:00:01.000Z",
      expiresAt: "2026-07-15T10:01:00.000Z",
    });
  });

  it("ends active approval at the prepared authority deadline", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    const signing = createCapabilityWalletSigningSession({
      connector: {
        discover: async () => CONNECTOR_CAPABILITIES,
        requestApproval: async () => {
          vi.advanceTimersByTime(60_001);
          return APPROVED_SIGNATURE;
        },
      },
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      prepared,
      timeoutMilliseconds: 600_000,
    });

    await expect(signing).rejects.toThrow(/timed out/iu);
  });

  it("never requests approval when discovery resolves after timeout", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    let finishDiscovery!: (value: unknown) => void;
    const requestApproval = vi.fn(async () => APPROVED_SIGNATURE);
    const connector: CapabilityWalletConnector = {
      discover: async () =>
        new Promise<unknown>((resolve) => (finishDiscovery = resolve)),
      requestApproval,
    };
    const signing = createCapabilityWalletSigningSession({
      connector,
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      prepared,
      timeoutMilliseconds: 10,
    });
    const timedOut = expect(signing).rejects.toThrow(/timed out/iu);

    await vi.advanceTimersByTimeAsync(11);
    await timedOut;
    finishDiscovery(CONNECTOR_CAPABILITIES);
    await Promise.resolve();
    await Promise.resolve();

    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("allows one claim just before expiry", async () => {
    const approved = await approvedSession();
    vi.setSystemTime(NOW + 999);

    expect(() =>
      claimApprovedCapabilityWalletSigningSession(approved),
    ).not.toThrow();
  });

  it.each([
    ["at", 1_000],
    ["after", 1_001],
  ])("rejects the first claim %s expiry", async (_label, elapsed) => {
    const approved = await approvedSession();
    vi.setSystemTime(NOW + elapsed);

    expect(() => claimApprovedCapabilityWalletSigningSession(approved)).toThrow(
      /expired/iu,
    );
  });

  it("rejects material clock rollback before the first claim", async () => {
    const approved = await approvedSession();
    vi.setSystemTime(NOW - 5_001);

    expect(() => claimApprovedCapabilityWalletSigningSession(approved)).toThrow(
      /clock rollback/iu,
    );
  });
});
