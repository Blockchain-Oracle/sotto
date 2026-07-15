import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCapabilityWalletSigningSession,
  type CapabilityWalletSigningResult,
} from "../../../packages/x402-canton/src/index.js";
import { verifiedCapabilityBootstrap } from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import {
  createOpenRpcCapabilityWallet,
  OPENRPC_CAPABILITIES_METHOD,
  type OpenRpcCapabilityWalletRequest,
} from "../src/openrpc-capability-wallet.js";
import { callOpenRpcSdkProvider } from "../src/openrpc-capability-wallet-provider.js";
import {
  OPENRPC_CAPABILITIES,
  OPENRPC_CONNECTOR_ID,
  OPENRPC_CONNECTOR_ORIGIN,
  OPENRPC_NETWORK,
  OPENRPC_PACKAGE_ID,
} from "./openrpc-capability-wallet.conformance.js";

type SdkRequest = (value: OpenRpcCapabilityWalletRequest) => Promise<unknown>;

function connectorFor(request: SdkRequest) {
  return createOpenRpcCapabilityWallet({
    connectorId: OPENRPC_CONNECTOR_ID,
    expectedNetwork: OPENRPC_NETWORK,
    expectedOrigin: OPENRPC_CONNECTOR_ORIGIN,
    expectedPackageId: OPENRPC_PACKAGE_ID,
    payerParty: OPENRPC_CAPABILITIES.payerParty,
    provider: { request },
  });
}

export async function signWithOpenRpcProvider(
  request: SdkRequest,
): Promise<CapabilityWalletSigningResult> {
  return createCapabilityWalletSigningSession({
    connector: connectorFor(request),
    connectorId: OPENRPC_CONNECTOR_ID,
    connectorOrigin: OPENRPC_CONNECTOR_ORIGIN,
    prepared: await verifiedCapabilityBootstrap(),
    timeoutMilliseconds: 1_000,
  });
}

export function registerOpenRpcSecurityCases(): void {
  describe("OpenRPC SDK provider security", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("returns explicit unsupported for the SDK method-not-found error", async () => {
      const provider = vi.fn(async () => {
        throw new Error("RPC error: -32601 - Method not found");
      });

      await expect(signWithOpenRpcProvider(provider)).resolves.toMatchObject({
        connectorKind: "openrpc",
        outcome: "unsupported",
        reason: "unsupported-prepared-signing",
      });
      expect(provider).toHaveBeenCalledOnce();
    });

    it.each([
      ["null", null],
      ["array", []],
      ["scalar", "supported"],
      ["empty object", {}],
    ])(
      "rejects a %s capability result before approval",
      async (_name, value) => {
        const provider = vi.fn(async () => value);

        await expect(signWithOpenRpcProvider(provider)).rejects.toThrow(
          /capabilit/iu,
        );
        expect(provider).toHaveBeenCalledOnce();
      },
    );

    it("rejects a changed discovered payer before approval", async () => {
      const provider = vi.fn(async () => ({
        ...OPENRPC_CAPABILITIES,
        payerParty: "other::1220payer",
      }));

      await expect(signWithOpenRpcProvider(provider)).rejects.toThrow(
        "capability wallet discovery failed",
      );
      expect(provider).toHaveBeenCalledOnce();
    });

    it("redacts SDK provider error messages", async () => {
      const provider = vi.fn(async () => {
        throw new Error("RPC error: -32000 - private provider detail");
      });

      await expect(signWithOpenRpcProvider(provider)).rejects.toThrow(
        "capability wallet discovery failed",
      );
      await expect(
        callOpenRpcSdkProvider(
          { request: provider },
          { method: OPENRPC_CAPABILITIES_METHOD, params: {} },
          new AbortController().signal,
        ),
      ).rejects.toThrow("OpenRPC wallet provider returned error code -32000");
    });

    it("redacts a malformed provider thenable", async () => {
      const secret = "-----BEGIN PRIVATE KEY-----provider-secret";
      const result = Object.create(null) as Record<string, unknown>;
      Object.defineProperty(result, "then", {
        get: () => {
          throw new Error(secret);
        },
      });
      let failure: unknown;
      try {
        await callOpenRpcSdkProvider(
          { request: () => result as never },
          { method: OPENRPC_CAPABILITIES_METHOD, params: {} },
          new AbortController().signal,
        );
      } catch (error) {
        failure = error;
      }

      expect(failure).toEqual(
        new Error("OpenRPC wallet provider request failed"),
      );
      expect(String(failure)).not.toContain(secret);
    });
  });
}
