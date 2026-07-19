import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPENRPC_CAPABILITIES_METHOD,
  OPENRPC_SIGN_PREPARED_METHOD,
  type OpenRpcCapabilityWalletRequest,
} from "../src/openrpc-capability-wallet.js";
import { OPENRPC_CAPABILITIES } from "./openrpc-capability-wallet.conformance.js";
import { signWithOpenRpcProvider } from "./openrpc-capability-wallet-security.cases.js";

export function registerOpenRpcApprovalSecurityCases(): void {
  describe("OpenRPC SDK approval response", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each([
      ["null", null],
      ["empty object", {}],
      [
        "extra approval field",
        { outcome: "rejected", reason: "user-rejected", secret: true },
      ],
      ["malformed signature", { outcome: "approved", signature: {} }],
    ])("rejects %s without accepting a signature", async (_name, response) => {
      const provider = vi.fn(
        async (request: OpenRpcCapabilityWalletRequest) => {
          if (request.method === OPENRPC_CAPABILITIES_METHOD) {
            return OPENRPC_CAPABILITIES;
          }
          expect(request.method).toBe(OPENRPC_SIGN_PREPARED_METHOD);
          return response;
        },
      );

      await expect(signWithOpenRpcProvider(provider)).rejects.toThrow(
        /approval|signature|object|keys/iu,
      );
      expect(provider).toHaveBeenCalledTimes(2);
    });
  });
}
