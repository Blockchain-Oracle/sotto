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

function input(
  prepared: Awaited<ReturnType<typeof verifiedCapabilityBootstrap>>,
  connector: CapabilityWalletConnector,
) {
  return {
    connector,
    connectorId: CONNECTOR_ID,
    connectorOrigin: CONNECTOR_ORIGIN,
    prepared,
    timeoutMilliseconds: 1_000,
  } as const;
}

describe("capability wallet signing session provenance", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("rejects a claimed preparation before connector discovery", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    const first: CapabilityWalletConnector = {
      discover: async () => CONNECTOR_CAPABILITIES,
      requestApproval: async () => APPROVED_SIGNATURE,
    };
    await createCapabilityWalletSigningSession(input(prepared, first));
    const discover = vi.fn(async () => CONNECTOR_CAPABILITIES);
    const requestApproval = vi.fn(async () => APPROVED_SIGNATURE);

    await expect(
      createCapabilityWalletSigningSession(
        input(prepared, { discover, requestApproval }),
      ),
    ).rejects.toThrow(/already claimed/iu);
    expect(discover).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("rejects stale or forged preparation before connector discovery", async () => {
    const stale = await verifiedCapabilityBootstrap();
    vi.advanceTimersByTime(60_001);
    const discover = vi.fn(async () => CONNECTOR_CAPABILITIES);
    const requestApproval = vi.fn(async () => APPROVED_SIGNATURE);

    await expect(
      createCapabilityWalletSigningSession(
        input(stale, { discover, requestApproval }),
      ),
    ).rejects.toThrow(/stale/iu);
    await expect(
      createCapabilityWalletSigningSession(
        input({ ...stale } as never, { discover, requestApproval }),
      ),
    ).rejects.toThrow(/not authenticated/iu);
    expect(discover).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("authenticates one isolated claim for signature verification", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    let connectorBytes: Uint8Array | undefined;
    const connector: CapabilityWalletConnector = {
      discover: async () => CONNECTOR_CAPABILITIES,
      requestApproval: async (request) => {
        connectorBytes = new Uint8Array(request.preparedTransaction);
        request.preparedTransaction[0] =
          (request.preparedTransaction.at(0) ?? 0) ^ 0xff;
        return APPROVED_SIGNATURE;
      },
    };
    const approved = await createCapabilityWalletSigningSession(
      input(prepared, connector),
    );

    expect(() =>
      claimApprovedCapabilityWalletSigningSession({ ...approved }),
    ).toThrow(/not authenticated/iu);
    const claimed = claimApprovedCapabilityWalletSigningSession(approved);
    expect(claimed.preparedTransaction).toEqual(connectorBytes);
    expect(claimed).toMatchObject({
      capabilityIntentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      connectorId: CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      createdAt: NOW,
      expiresAt: NOW + 1_000,
      network: "canton:devnet",
      origin: CONNECTOR_ORIGIN,
      packageId: expect.stringMatching(/^[0-9a-f]{64}$/u),
      payerParty: expect.any(String),
      preparedTransactionHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      sessionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      synchronizerId: expect.any(String),
    });
    expect(() => claimApprovedCapabilityWalletSigningSession(approved)).toThrow(
      /already claimed/iu,
    );
  });

  it("snapshots prepared authority and connector before discovery", async () => {
    const originalPrepared = await verifiedCapabilityBootstrap();
    const replacementPrepared = await verifiedCapabilityBootstrap();
    const originalApproval = vi.fn(async () => APPROVED_SIGNATURE);
    const replacementApproval = vi.fn(async () => APPROVED_SIGNATURE);
    const replacementConnector: CapabilityWalletConnector = {
      discover: async () => CONNECTOR_CAPABILITIES,
      requestApproval: replacementApproval,
    };
    const mutable = {
      ...input(originalPrepared, {} as CapabilityWalletConnector),
    };
    const originalConnector: CapabilityWalletConnector = {
      discover: async () => {
        mutable.prepared = replacementPrepared;
        mutable.connector = replacementConnector;
        return CONNECTOR_CAPABILITIES;
      },
      requestApproval: originalApproval,
    };
    mutable.connector = originalConnector;

    await createCapabilityWalletSigningSession(mutable);

    expect(originalApproval).toHaveBeenCalledOnce();
    expect(replacementApproval).not.toHaveBeenCalled();
  });
});
