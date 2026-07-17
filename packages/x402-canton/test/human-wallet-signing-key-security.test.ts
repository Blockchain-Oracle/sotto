import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletSigningSession } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { signedHumanWalletInputs } from "./human-wallet-signing-session.fixtures.js";

type KeyMutation = (key: Record<string, string>) => void;

describe("human wallet registered-key and response security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each<readonly [string, KeyMutation]>([
    ["fingerprint", (key) => (key.fingerprint = `1220${"f".repeat(64)}`)],
    [
      "public-key format",
      (key) => (key.publicKeyFormat = "PUBLIC_KEY_FORMAT_DER_SPKI"),
    ],
    [
      "public-key bytes",
      (key) => (key.publicKey = Buffer.alloc(32, 9).toString("base64")),
    ],
  ])(
    "rejects a wrong registered %s after one lookup",
    async (_name, mutate) => {
      const input = await signedHumanWalletInputs();
      const resolveRegisteredPublicKey = vi.fn(async () => {
        const key = { ...input.registeredKey } as Record<string, string>;
        mutate(key);
        return key;
      });

      await expect(
        createHumanWalletSigningSession(
          { preflight: input.preflight, prepared: input.prepared },
          { resolveRegisteredPublicKey },
        ),
      ).rejects.toThrow(/registered public key is invalid/iu);
      expect(resolveRegisteredPublicKey).toHaveBeenCalledOnce();
    },
  );

  it.each(["wrong hash", "wrong version", "extra member"] as const)(
    "rejects a response with a %s before key lookup",
    async (mutation) => {
      const input = await signedHumanWalletInputs({
        approval: async (_request, response) => {
          if (mutation === "wrong hash") {
            return {
              ...response,
              preparedTransactionHash: `sha256:${"f".repeat(64)}`,
            };
          }
          if (mutation === "wrong version") {
            return { ...response, version: "future-response" };
          }
          return { ...response, privateOverride: true };
        },
      });
      const resolveRegisteredPublicKey = vi.fn(async () => input.registeredKey);

      await expect(
        createHumanWalletSigningSession(
          { preflight: input.preflight, prepared: input.prepared },
          { resolveRegisteredPublicKey },
        ),
      ).rejects.toThrow(/approval|response|keys/iu);
      expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
    },
  );
});
