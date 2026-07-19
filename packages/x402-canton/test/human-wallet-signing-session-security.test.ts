import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import { createHumanWalletSigningSession } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  signedHumanWalletInputs,
  type SignedHumanWalletInputs,
} from "./human-wallet-signing-session.fixtures.js";

function dependencies(input: SignedHumanWalletInputs) {
  return {
    resolveRegisteredPublicKey: async () => input.registeredKey,
  };
}

function signing(input: SignedHumanWalletInputs) {
  return createHumanWalletSigningSession(
    { preflight: input.preflight, prepared: input.prepared },
    dependencies(input),
    { timeoutMilliseconds: 600_000 },
  );
}

describe("policy-free human wallet session authority", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(["preflight", "prepared"] as const)(
    "rejects a structural %s clone before rediscovery",
    async (field) => {
      const input = await signedHumanWalletInputs();
      const candidate = {
        preflight: input.preflight,
        prepared: input.prepared,
        [field]: { ...input[field] },
      };

      await expect(
        createHumanWalletSigningSession(
          candidate as never,
          dependencies(input),
          { timeoutMilliseconds: 600_000 },
        ),
      ).rejects.toThrow(/not authenticated/iu);
      expect(input.discoveryCalls()).toBe(1);
      expect(input.approvalCalls()).toBe(0);
    },
  );

  it("rejects caller authority overrides and accessors without invocation", async () => {
    const input = await signedHumanWalletInputs();
    const read = vi.fn(() => input.preflight);
    const candidate = { prepared: input.prepared } as Record<string, unknown>;
    Object.defineProperty(candidate, "preflight", {
      enumerable: true,
      get: read,
    });

    await expect(
      createHumanWalletSigningSession(candidate as never, dependencies(input), {
        timeoutMilliseconds: 600_000,
      }),
    ).rejects.toThrow(/data properties/iu);
    await expect(
      createHumanWalletSigningSession(
        {
          preflight: input.preflight,
          prepared: input.prepared,
          connector: {},
        } as never,
        dependencies(input),
        { timeoutMilliseconds: 600_000 },
      ),
    ).rejects.toThrow(/keys/iu);
    expect(read).not.toHaveBeenCalled();
    expect(input.discoveryCalls()).toBe(1);
  });

  it("does not consume a capability mismatch and permits one corrected retry", async () => {
    let rediscoveries = 0;
    const input = await signedHumanWalletInputs({
      rediscover: (capabilities) => {
        rediscoveries += 1;
        return rediscoveries === 1
          ? {
              ...(capabilities as Record<string, unknown>),
              networks: ["canton:devnet", "canton:attacker"],
            }
          : capabilities;
      },
    });

    await expect(signing(input)).rejects.toThrow(/changed since preflight/iu);
    expect(input.approvalCalls()).toBe(0);
    await expect(signing(input)).resolves.toMatchObject({
      outcome: "verified",
    });
    expect(input.approvalCalls()).toBe(1);
  });

  it("commits both authorities before invoking approval", async () => {
    const input = await signedHumanWalletInputs({
      approval: async (_request, response) => {
        await expect(signing(input)).rejects.toThrow(/already claimed/iu);
        return response;
      },
    });

    await expect(signing(input)).resolves.toMatchObject({
      outcome: "verified",
    });
    expect(input.approvalCalls()).toBe(1);
  });

  it("allows exactly one concurrent approval call", async () => {
    const input = await signedHumanWalletInputs();
    const results = await Promise.allSettled([signing(input), signing(input)]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(input.approvalCalls()).toBe(1);
  });

  it("consumes authority before a failed approval journal callback", async () => {
    const input = await signedHumanWalletInputs();
    const onApprovalRequested = vi.fn(async () => {
      throw new Error("private journal credential");
    });

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        dependencies(input),
        { onApprovalRequested, timeoutMilliseconds: 600_000 },
      ),
    ).rejects.toEqual(new Error("human wallet approval journal failed"));
    expect(onApprovalRequested).toHaveBeenCalledOnce();
    expect(input.approvalCalls()).toBe(0);
    await expect(signing(input)).rejects.toThrow(/already claimed/iu);
  });

  it("does not export private execution claims", () => {
    expect(publicApi).not.toHaveProperty(
      "claimVerifiedHumanWalletSigningSession",
    );
    expect(publicApi).not.toHaveProperty(
      "registerVerifiedHumanWalletSigningSession",
    );
  });
});
