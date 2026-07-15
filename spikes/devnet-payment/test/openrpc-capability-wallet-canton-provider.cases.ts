import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../../../packages/x402-canton/src/index.js";
import { verifiedCapabilityBootstrap } from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import {
  adaptCantonOpenRpcProvider,
  type CantonInjectedOpenRpcProvider,
  createOpenRpcCapabilityWallet,
  OPENRPC_CAPABILITIES_METHOD,
} from "../src/openrpc-capability-wallet.js";
import {
  OPENRPC_CAPABILITIES,
  OPENRPC_CONNECTOR_ID,
  OPENRPC_CONNECTOR_ORIGIN,
  OPENRPC_NETWORK,
  OPENRPC_PACKAGE_ID,
} from "./openrpc-capability-wallet.conformance.js";
import { APPROVED_SIGNATURE } from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";

export function registerCantonOpenRpcProviderCases(): void {
  describe("installed Canton dApp provider adapter", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("adapts the installed Canton dApp provider request contract", async () => {
      const request = vi.fn(async (value: { method: string }) =>
        value.method === OPENRPC_CAPABILITIES_METHOD
          ? OPENRPC_CAPABILITIES
          : APPROVED_SIGNATURE,
      );
      const provider = { request } as unknown as Pick<
        CantonInjectedOpenRpcProvider,
        "request"
      >;
      const connector = createOpenRpcCapabilityWallet({
        connectorId: OPENRPC_CONNECTOR_ID,
        expectedNetwork: OPENRPC_NETWORK,
        expectedOrigin: OPENRPC_CONNECTOR_ORIGIN,
        expectedPackageId: OPENRPC_PACKAGE_ID,
        payerParty: OPENRPC_CAPABILITIES.payerParty,
        provider: adaptCantonOpenRpcProvider(provider),
      });

      await expect(
        createCapabilityWalletSigningSession({
          connector,
          connectorId: OPENRPC_CONNECTOR_ID,
          connectorOrigin: OPENRPC_CONNECTOR_ORIGIN,
          prepared: await verifiedCapabilityBootstrap(),
          timeoutMilliseconds: 1_000,
        }),
      ).resolves.toMatchObject({ outcome: "approved" });
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[0]![0]).toEqual({
        method: OPENRPC_CAPABILITIES_METHOD,
        params: expect.any(Object),
      });
      expect(request.mock.calls[0]![0]).not.toHaveProperty("id");
      expect(request.mock.calls[0]![0]).not.toHaveProperty("jsonrpc");
    });
  });
}
