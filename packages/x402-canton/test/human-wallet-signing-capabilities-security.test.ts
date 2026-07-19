import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletSigningSession } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { signedHumanWalletInputs } from "./human-wallet-signing-session.fixtures.js";

type AccessorMutation = (
  capabilities: Record<string, unknown>,
  getter: () => string,
) => void;

const accessorMutations: ReadonlyArray<readonly [string, AccessorMutation]> = [
  [
    "capability root",
    (capabilities, getter) =>
      Object.defineProperty(capabilities, "version", {
        enumerable: true,
        get: getter,
      }),
  ],
  [
    "signing key",
    (capabilities, getter) =>
      Object.defineProperty(
        capabilities.signingKey as Record<string, unknown>,
        "purpose",
        { enumerable: true, get: getter },
      ),
  ],
  [
    "capability array index",
    (capabilities, getter) =>
      Object.defineProperty(capabilities.approvalVersions as string[], "0", {
        enumerable: true,
        get: getter,
      }),
  ],
];

describe("human wallet capability descriptor security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(accessorMutations)(
    "rejects an accessor-backed %s without invocation",
    async (_name, mutate) => {
      const getter = vi.fn(() => "attacker-controlled");
      const input = await signedHumanWalletInputs({
        rediscover: (capabilities) => {
          const candidate = structuredClone(capabilities) as Record<
            string,
            unknown
          >;
          mutate(candidate, getter);
          return candidate;
        },
      });

      await expect(
        createHumanWalletSigningSession(
          { preflight: input.preflight, prepared: input.prepared },
          { resolveRegisteredPublicKey: async () => input.registeredKey },
        ),
      ).rejects.toThrow(/rediscovery is invalid/iu);
      expect(getter).not.toHaveBeenCalled();
      expect(input.approvalCalls()).toBe(0);
    },
  );

  it("rejects a proxied capability root without invoking traps", async () => {
    const traps = {
      getPrototypeOf: vi.fn(Reflect.getPrototypeOf),
      ownKeys: vi.fn(Reflect.ownKeys),
      getOwnPropertyDescriptor: vi.fn(Reflect.getOwnPropertyDescriptor),
    };
    const input = await signedHumanWalletInputs({
      rediscover: (capabilities) =>
        new Proxy(
          structuredClone(capabilities) as Record<string, unknown>,
          traps,
        ),
    });

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey: async () => input.registeredKey },
      ),
    ).rejects.toThrow(/rediscovery is invalid/iu);
    expect(traps.getPrototypeOf).not.toHaveBeenCalled();
    expect(traps.ownKeys).not.toHaveBeenCalled();
    expect(traps.getOwnPropertyDescriptor).not.toHaveBeenCalled();
  });

  it("rejects proxied arrays and hidden members without approval", async () => {
    for (const mutation of ["proxy", "symbol"] as const) {
      const trap = vi.fn(Reflect.get);
      const input = await signedHumanWalletInputs({
        rediscover: (capabilities) => {
          const candidate = structuredClone(capabilities) as Record<
            string,
            unknown
          >;
          const values = candidate.approvalVersions as string[];
          candidate.approvalVersions =
            mutation === "proxy"
              ? new Proxy(values, { get: trap })
              : Object.assign(values, { [Symbol("hidden")]: "private" });
          return candidate;
        },
      });

      await expect(
        createHumanWalletSigningSession(
          { preflight: input.preflight, prepared: input.prepared },
          { resolveRegisteredPublicKey: async () => input.registeredKey },
        ),
      ).rejects.toThrow(/rediscovery is invalid/iu);
      expect(input.approvalCalls()).toBe(0);
      if (mutation === "proxy") expect(trap).not.toHaveBeenCalled();
    }
  });
});
