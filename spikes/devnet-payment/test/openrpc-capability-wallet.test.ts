import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../../../packages/x402-canton/src/index.js";
import {
  APPROVED_SIGNATURE,
  verifiedCapabilityBootstrap,
} from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import { registerCapabilityWalletConnectorContract } from "../../../packages/x402-canton/test/capability-wallet-connector.contract.js";
import {
  createOpenRpcCapabilityWallet,
  OPENRPC_CAPABILITIES_METHOD,
  OPENRPC_SIGN_PREPARED_METHOD,
  type OpenRpcCapabilityWalletRequest,
} from "../src/openrpc-capability-wallet.js";
import {
  OPENRPC_CAPABILITIES as capabilities,
  OPENRPC_CONNECTOR_ID as CONNECTOR_ID,
  OPENRPC_CONNECTOR_ORIGIN as CONNECTOR_ORIGIN,
  OPENRPC_NETWORK,
  OPENRPC_PACKAGE_ID,
  openRpcConnectorHarness,
} from "./openrpc-capability-wallet.conformance.js";
import { registerOpenRpcSecurityCases } from "./openrpc-capability-wallet-security.cases.js";
import { registerOpenRpcApprovalSecurityCases } from "./openrpc-capability-wallet-approval-security.cases.js";
import { registerRawOpenRpcSecurityCases } from "./openrpc-capability-wallet-jsonrpc.cases.js";
import { registerCantonOpenRpcProviderCases } from "./openrpc-capability-wallet-canton-provider.cases.js";

registerCapabilityWalletConnectorContract(openRpcConnectorHarness);
registerOpenRpcSecurityCases();
registerOpenRpcApprovalSecurityCases();
registerRawOpenRpcSecurityCases();
registerCantonOpenRpcProviderCases();

describe("OpenRPC capability wallet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("negotiates exact prepared-signing support before one approval", async () => {
    const requests: OpenRpcCapabilityWalletRequest[] = [];
    const provider = {
      origin: CONNECTOR_ORIGIN,
      request: vi.fn(async (request: OpenRpcCapabilityWalletRequest) => {
        requests.push(structuredClone(request));
        return request.method === OPENRPC_CAPABILITIES_METHOD
          ? capabilities
          : APPROVED_SIGNATURE;
      }),
    };
    const connector = createOpenRpcCapabilityWallet({
      connectorId: CONNECTOR_ID,
      expectedNetwork: OPENRPC_NETWORK,
      expectedOrigin: CONNECTOR_ORIGIN,
      expectedPackageId: OPENRPC_PACKAGE_ID,
      payerParty: capabilities.payerParty,
      provider,
    });

    const result = await createCapabilityWalletSigningSession({
      connector,
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      prepared: await verifiedCapabilityBootstrap(),
      timeoutMilliseconds: 1_000,
    });
    expect(result).toMatchObject({
      connectorKind: "openrpc",
      outcome: "approved",
      origin: CONNECTOR_ORIGIN,
    });

    expect(requests.map(({ method }) => method)).toEqual([
      OPENRPC_CAPABILITIES_METHOD,
      OPENRPC_SIGN_PREPARED_METHOD,
    ]);
    expect(requests[0]).toEqual({
      method: OPENRPC_CAPABILITIES_METHOD,
      params: {
        connectorId: CONNECTOR_ID,
        origin: CONNECTOR_ORIGIN,
        payerParty: capabilities.payerParty,
        version: "sotto-openrpc-capability-wallet-v1",
      },
    });
    expect(requests[1]).toMatchObject({
      method: OPENRPC_SIGN_PREPARED_METHOD,
      params: {
        request: {
          connectorId: CONNECTOR_ID,
          connectorOrigin: CONNECTOR_ORIGIN,
          preparedTransaction: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/u),
          preparedTransactionHash: expect.stringMatching(
            /^sha256:[0-9a-f]{64}$/u,
          ),
        },
        version: "sotto-openrpc-capability-wallet-v1",
      },
    });
    expect(Object.keys(requests[1]!.params)).toEqual(["request", "version"]);
    expect(
      Object.keys(
        requests[1]!.params.request as Readonly<Record<string, unknown>>,
      ).sort(),
    ).toEqual([
      "approval",
      "capabilityIntentHash",
      "connectorId",
      "connectorOrigin",
      "createdAt",
      "expiresAt",
      "preparedTransaction",
      "preparedTransactionHash",
      "sessionId",
      "version",
    ]);
    expect(requests[1]!.params).not.toHaveProperty("actAs");
    expect(requests[1]!.params).not.toHaveProperty("userId");
    expect(requests[1]!.params).not.toHaveProperty("privateKey");
    const rawPrepared = (
      requests[1]!.params.request as Readonly<Record<string, unknown>>
    ).preparedTransaction;
    expect(JSON.stringify(result)).not.toContain(rawPrepared);
  });

  it("supports an embedded provider bound to its page origin", async () => {
    const origin = "https://embedded-wallet.example";
    const embeddedCapabilities = { ...capabilities, origin };
    const provider = {
      origin,
      request: async (request: OpenRpcCapabilityWalletRequest) =>
        request.method === OPENRPC_CAPABILITIES_METHOD
          ? embeddedCapabilities
          : APPROVED_SIGNATURE,
    };
    const connector = createOpenRpcCapabilityWallet({
      connectorId: CONNECTOR_ID,
      expectedNetwork: OPENRPC_NETWORK,
      expectedOrigin: origin,
      expectedPackageId: OPENRPC_PACKAGE_ID,
      payerParty: capabilities.payerParty,
      provider,
    });

    await expect(
      createCapabilityWalletSigningSession({
        connector,
        connectorId: CONNECTOR_ID,
        connectorOrigin: origin,
        prepared: await verifiedCapabilityBootstrap(),
        timeoutMilliseconds: 1_000,
      }),
    ).resolves.toMatchObject({ outcome: "approved", origin });
  });
});
