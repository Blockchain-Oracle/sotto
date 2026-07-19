import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import {
  prepareHumanWalletConnectorPreflightBinding,
  prepareHumanWalletConnectorPreflightSessionClaim,
} from "../src/human-wallet-connector-preflight-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  HUMAN_PACKAGE_ID,
  humanPreflightInput,
  mutateHumanConnectorCapabilities,
} from "./human-wallet-connector-preflight.fixtures.js";

const PURCHASE = `sha256:${"d".repeat(64)}`;

describe("human wallet preflight timing and connector snapshot", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("cancels hung discovery without leaking the caller reason", async () => {
    const controller = new AbortController();
    let discoverySignal: AbortSignal | undefined;
    const purchase = createHumanWalletConnectorPreflight(
      {
        ...humanPreflightInput(),
        connector: {
          discover: async ({ signal }) => {
            discoverySignal = signal;
            return await new Promise<never>(() => undefined);
          },
          requestApproval: vi.fn(),
        },
      },
      { signal: controller.signal },
    );
    const rejection = expect(purchase).rejects.toThrow(
      "human wallet connector preflight cancelled",
    );
    controller.abort("PRIVATE_KEY=do-not-leak");
    await rejection;
    expect(discoverySignal?.aborted).toBe(true);
  });

  it("times out hung discovery and never advances after late completion", async () => {
    let complete!: (value: unknown) => void;
    const observePayerIdentity = vi.fn();
    const purchase = createHumanWalletConnectorPreflight(
      {
        ...humanPreflightInput(),
        connector: {
          discover: async () =>
            await new Promise((resolve) => {
              complete = resolve;
            }),
          requestApproval: vi.fn(),
        },
        observePayerIdentity,
      },
      { timeoutMilliseconds: 10 },
    );
    const rejection = expect(purchase).rejects.toThrow(
      "human wallet connector preflight deadline exceeded",
    );
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    complete(HUMAN_CONNECTOR_CAPABILITIES);
    await Promise.resolve();
    expect(observePayerIdentity).not.toHaveBeenCalled();
  });

  it("times out a hung identity read before approval", async () => {
    let identitySignal: AbortSignal | undefined;
    const purchase = createHumanWalletConnectorPreflight(
      {
        ...humanPreflightInput(),
        observePayerIdentity: async ({ signal } = {}) => {
          identitySignal = signal;
          return await new Promise<never>(() => undefined);
        },
      },
      { timeoutMilliseconds: 10 },
    );
    const rejection = expect(purchase).rejects.toThrow(
      "human wallet connector preflight deadline exceeded",
    );
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(identitySignal?.aborted).toBe(true);
  });

  it("redacts discovery failures", async () => {
    await expect(
      createHumanWalletConnectorPreflight({
        ...humanPreflightInput(),
        connector: {
          discover: async () => {
            throw new Error("PRIVATE_KEY=do-not-leak");
          },
          requestApproval: vi.fn(),
        },
      }),
    ).rejects.toThrow("human wallet connector discovery failed");
  });

  it("rejects acquisition clock rollback", async () => {
    const input = humanPreflightInput();
    await expect(
      createHumanWalletConnectorPreflight({
        ...input,
        connector: {
          discover: async () => {
            vi.setSystemTime(new Date(Date.parse(HUMAN_PURCHASE_NOW) - 5_001));
            return HUMAN_CONNECTOR_CAPABILITIES;
          },
          requestApproval: vi.fn(),
        },
      }),
    ).rejects.toThrow(/clock moved backwards/u);
  });

  it("snapshots methods, this binding, configuration, and discovery data", async () => {
    const originalApproval = vi.fn(async () => "original");
    const replacementApproval = vi.fn(async () => "replacement");
    const capabilities = mutateHumanConnectorCapabilities(
      () => undefined,
    ) as Record<string, unknown>;
    let input = humanPreflightInput(capabilities);
    const connector = {
      discover: async function () {
        expect(this).toBe(connector);
        connector.requestApproval = replacementApproval;
        (input as unknown as Record<string, unknown>).expectedPackageId =
          "f".repeat(64);
        return capabilities;
      },
      requestApproval: originalApproval,
    };
    input = { ...input, connector };
    const baseIdentity = input.observePayerIdentity;
    input = {
      ...input,
      observePayerIdentity: async (options) => {
        capabilities.networks = ["canton:mutated"];
        return baseIdentity(options);
      },
    };

    const result = await createHumanWalletConnectorPreflight(input);
    const binding = prepareHumanWalletConnectorPreflightBinding(
      result,
      PURCHASE,
    );
    binding.commit();
    const claim = prepareHumanWalletConnectorPreflightSessionClaim(
      result,
      PURCHASE,
    );
    expect(claim.authority.expectedPackageId).toBe(HUMAN_PACKAGE_ID);
    expect(claim.authority.capabilities.networks).toEqual(["canton:devnet"]);
    await claim.authority.connector.requestApproval(
      {},
      { signal: new AbortController().signal },
    );
    expect(originalApproval).toHaveBeenCalledOnce();
    expect(replacementApproval).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed connector methods without invoking them", async () => {
    let getterCalls = 0;
    const connector = { discover: vi.fn() } as unknown as Record<
      string,
      unknown
    >;
    Object.defineProperty(connector, "requestApproval", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return vi.fn();
      },
    });
    await expect(
      createHumanWalletConnectorPreflight({
        ...humanPreflightInput(),
        connector: connector as never,
      }),
    ).rejects.toThrow(/own data properties/u);
    expect(getterCalls).toBe(0);
  });
});
