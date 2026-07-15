import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCapabilityWalletSigningSession,
  type CapabilityWalletConnector,
} from "../src/index.js";
import { verifyCapabilityWalletSignature } from "../src/capability-wallet-signature.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
  verifiedCapabilityBootstrap,
} from "./capability-wallet-connector.fixtures.js";
import { signedCapabilitySession } from "./capability-wallet-signature.fixtures.js";

const NOW = new Date("2026-07-15T10:00:00.000Z");
const KEY_LIKE_SECRET = "-----BEGIN PRIVATE KEY-----private-wallet-material";

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

export function registerCapabilityWalletSecurityCases(): void {
  describe("capability wallet connector privacy", () => {
    beforeEach(() => vi.useFakeTimers({ now: NOW }));
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("redacts an untrusted discovery failure", async () => {
      const prepared = await verifiedCapabilityBootstrap();
      const connector: CapabilityWalletConnector = {
        discover: async () => {
          throw new Error(KEY_LIKE_SECRET);
        },
        requestApproval: async () => APPROVED_SIGNATURE,
      };

      let failure: unknown;
      try {
        await createCapabilityWalletSigningSession(
          sessionInput(prepared, connector),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toEqual(new Error("capability wallet discovery failed"));
      expect(String(failure)).not.toContain(KEY_LIKE_SECRET);
    });

    it("redacts prepared bytes from an untrusted approval failure", async () => {
      const prepared = await verifiedCapabilityBootstrap();
      let preparedBase64 = "";
      const connector: CapabilityWalletConnector = {
        discover: async () => CONNECTOR_CAPABILITIES,
        requestApproval: async (request) => {
          preparedBase64 = Buffer.from(request.preparedTransaction).toString(
            "base64",
          );
          throw new Error(`${KEY_LIKE_SECRET}:${preparedBase64}`);
        },
      };

      let failure: unknown;
      try {
        await createCapabilityWalletSigningSession(
          sessionInput(prepared, connector),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toEqual(new Error("capability wallet approval failed"));
      expect(String(failure)).not.toContain(KEY_LIKE_SECRET);
      expect(String(failure)).not.toContain(preparedBase64);
    });

    it("keeps every displayed authority field immutable during approval", async () => {
      const prepared = await verifiedCapabilityBootstrap();
      const requestApproval = vi.fn(async (request) => {
        const approval = request.approval as unknown as Record<string, unknown>;
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(approval)).toBe(true);
        expect(Object.isFrozen(approval.instrument)).toBe(true);
        expect(Object.isFrozen(approval.limits)).toBe(true);
        for (const [target, field] of [
          [request, "preparedTransactionHash"],
          [approval, "network"],
          [approval, "packageId"],
          [approval, "payerParty"],
          [approval, "recipientParty"],
          [approval, "resourceHash"],
          [approval, "synchronizerId"],
        ] as const) {
          expect(Reflect.set(target, field, "attacker-controlled")).toBe(false);
        }
        return APPROVED_SIGNATURE;
      });

      await expect(
        createCapabilityWalletSigningSession(
          sessionInput(prepared, {
            discover: async () => CONNECTOR_CAPABILITIES,
            requestApproval,
          }),
        ),
      ).resolves.toMatchObject({ outcome: "approved" });
      expect(requestApproval).toHaveBeenCalledOnce();
    });

    it.each([
      ["rejection", { outcome: "rejected", reason: "user-rejected" }],
      ["malformed approval", { outcome: "approved", signature: {} }],
    ])("consumes a %s before any replay", async (_label, response) => {
      const prepared = await verifiedCapabilityBootstrap();
      const firstApproval = vi.fn(async () => response);
      await createCapabilityWalletSigningSession(
        sessionInput(prepared, {
          discover: async () => CONNECTOR_CAPABILITIES,
          requestApproval: firstApproval,
        }),
      ).catch(() => undefined);
      const discover = vi.fn(async () => CONNECTOR_CAPABILITIES);
      const requestApproval = vi.fn(async () => APPROVED_SIGNATURE);

      await expect(
        createCapabilityWalletSigningSession(
          sessionInput(prepared, { discover, requestApproval }),
        ),
      ).rejects.toThrow(/claimed/iu);
      expect(firstApproval).toHaveBeenCalledOnce();
      expect(discover).not.toHaveBeenCalled();
      expect(requestApproval).not.toHaveBeenCalled();
    });

    it("rejects oversized key-shaped approval data without disclosure", async () => {
      const prepared = await verifiedCapabilityBootstrap();
      const response = {
        ...APPROVED_SIGNATURE,
        signature: {
          ...APPROVED_SIGNATURE.signature,
          signature: `${KEY_LIKE_SECRET}${"A".repeat(16_385)}`,
        },
      };

      let failure: unknown;
      try {
        await createCapabilityWalletSigningSession(
          sessionInput(prepared, {
            discover: async () => CONNECTOR_CAPABILITIES,
            requestApproval: async () => response,
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(String(failure)).toMatch(/signature/iu);
      expect(String(failure)).not.toContain(KEY_LIKE_SECRET);
    });

    it("rejects duplicate signature verification before a second key read", async () => {
      const fixture = await signedCapabilitySession("ed25519");
      await verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => fixture.registeredKey,
      });
      const secondResolver = vi.fn(async () => fixture.registeredKey);

      await expect(
        verifyCapabilityWalletSignature(fixture.session, {
          resolveRegisteredPublicKey: secondResolver,
        }),
      ).rejects.toThrow(/claimed/iu);
      expect(secondResolver).not.toHaveBeenCalled();
    });
  });
}
