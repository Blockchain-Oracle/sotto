import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCapabilityWalletSigningSession,
  type CapabilityWalletConnector,
} from "../src/index.js";
import { CAPABILITY_BOOTSTRAP_INPUT } from "./prepared-capability-bootstrap.fixtures.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
  recordingConnector,
  SIGNATURE,
  SIGNED_BY,
  verifiedCapabilityBootstrap,
} from "./capability-wallet-connector.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

function sessionInput(
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

describe("capability wallet connector", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("negotiates exact capability support before one explicit approval", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    const discover = vi.fn(async (_options: unknown) => CONNECTOR_CAPABILITIES);
    const requestApproval = vi.fn(
      async (_request: unknown, _options: unknown) => APPROVED_SIGNATURE,
    );
    const connector = { discover, requestApproval };

    const result = await createCapabilityWalletSigningSession(
      sessionInput(prepared, connector),
    );

    expect(discover).toHaveBeenCalledOnce();
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(discover.mock.calls[0]![0]).toEqual({
      signal: expect.any(AbortSignal),
    });
    const [request, options] = requestApproval.mock.calls[0]!;
    expect(options).toEqual({ signal: expect.any(AbortSignal) });
    expect(request).toMatchObject({
      approval: {
        action: "create-purchase-capability",
        network: CAPABILITY_BOOTSTRAP_INPUT.network,
        payerParty: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
      },
      capabilityIntentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      expiresAt: "2026-07-15T10:00:01.000Z",
      preparedTransaction: expect.any(Uint8Array),
      preparedTransactionHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      sessionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      version: "sotto-capability-wallet-request-v1",
    });
    expect(request).not.toHaveProperty("userId");
    expect(request).not.toHaveProperty("actAs");
    expect(result).toMatchObject({
      connectorId: CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      outcome: "approved",
      origin: CONNECTOR_ORIGIN,
      signature: {
        party: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
        signature: SIGNATURE,
        signedBy: SIGNED_BY,
      },
    });
  });

  it.each([
    ["network", { networks: ["canton:other"] }],
    ["package", { packageIds: ["f".repeat(64)] }],
    ["hash scheme", { hashingSchemeVersions: [] }],
    ["signature format", { signatureFormats: [] }],
    ["signing algorithm", { signingAlgorithms: [] }],
    ["prepared signing", { preparedTransactionSigning: false }],
    ["explicit approval", { explicitApproval: false }],
  ])(
    "reports unsupported %s without requesting approval",
    async (_label, mutation) => {
      const prepared = await verifiedCapabilityBootstrap();
      const requestApproval = vi.fn();
      const connector = {
        discover: async () => ({ ...CONNECTOR_CAPABILITIES, ...mutation }),
        requestApproval,
      } as CapabilityWalletConnector;

      await expect(
        createCapabilityWalletSigningSession(sessionInput(prepared, connector)),
      ).resolves.toMatchObject({
        outcome: "unsupported",
        reason: expect.stringMatching(/^unsupported-/u),
      });
      expect(requestApproval).not.toHaveBeenCalled();
    },
  );

  it("returns an explicit user rejection without a signature", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    const result = await createCapabilityWalletSigningSession(
      sessionInput(
        prepared,
        recordingConnector({ outcome: "rejected", reason: "user-rejected" }),
      ),
    );

    expect(result).toEqual({
      connectorId: CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      origin: CONNECTOR_ORIGIN,
      outcome: "rejected",
      reason: "user-rejected",
    });
  });

  it("aborts a hung approval at the bounded deadline", async () => {
    const prepared = await verifiedCapabilityBootstrap();
    const connector = {
      discover: async () => CONNECTOR_CAPABILITIES,
      requestApproval: async () => new Promise<never>(() => undefined),
    } as CapabilityWalletConnector;
    const signing = createCapabilityWalletSigningSession({
      ...sessionInput(prepared, connector),
      timeoutMilliseconds: 10,
    });

    await vi.advanceTimersByTimeAsync(11);
    await expect(signing).rejects.toThrow(/wallet approval timed out/iu);
  });
});
