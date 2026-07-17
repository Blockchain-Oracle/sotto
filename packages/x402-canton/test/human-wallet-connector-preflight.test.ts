import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  createHumanWalletConnectorPreflight,
  HUMAN_WALLET_PREFLIGHT_VERSION,
} from "../src/human-wallet-connector-preflight.js";
import { readAuthenticatedHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  HUMAN_CONNECTOR_ID,
  HUMAN_CONNECTOR_ORIGIN,
  humanPreflightInput,
} from "./human-wallet-connector-preflight.fixtures.js";
import { humanPayerIdentityObserver } from "./human-payer-identity.fixtures.js";

describe("pre-402 human wallet connector authority", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("discovers first and mints one exact opaque compatible preflight", async () => {
    const order: string[] = [];
    const discover = vi.fn(async (options: unknown) => {
      order.push("discover");
      expect(options).toEqual({ signal: expect.any(AbortSignal) });
      return HUMAN_CONNECTOR_CAPABILITIES;
    });
    const requestApproval = vi.fn();
    const baseObserver = humanPayerIdentityObserver();
    const observePayerIdentity = vi.fn(async (options: unknown) => {
      order.push("identity");
      return baseObserver(options as never);
    });

    const result = await createHumanWalletConnectorPreflight({
      ...humanPreflightInput(),
      connector: { discover, requestApproval },
      observePayerIdentity,
    });

    expect(order).toEqual(["discover", "identity"]);
    expect(requestApproval).not.toHaveBeenCalled();
    expect(result).toEqual({
      version: HUMAN_WALLET_PREFLIGHT_VERSION,
      outcome: "compatible",
      preflightId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      connectorId: HUMAN_CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      origin: HUMAN_CONNECTOR_ORIGIN,
      observedAt: HUMAN_PURCHASE_NOW,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(readAuthenticatedHumanWalletConnectorPreflight(result)).toBe(result);
    expect(publicApi.createHumanWalletConnectorPreflight).toBe(
      createHumanWalletConnectorPreflight,
    );
    expect(publicApi).not.toHaveProperty(
      "readAuthenticatedHumanWalletConnectorPreflight",
    );
  });

  it("returns static unsupported capability before reading payer identity", async () => {
    const observePayerIdentity = vi.fn();
    const result = await createHumanWalletConnectorPreflight({
      ...humanPreflightInput({
        ...HUMAN_CONNECTOR_CAPABILITIES,
        preparedTransactionSigning: false,
      }),
      observePayerIdentity,
    });

    expect(result).toEqual({
      connectorId: HUMAN_CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      origin: HUMAN_CONNECTOR_ORIGIN,
      outcome: "unsupported",
      reason: "unsupported-prepared-signing",
    });
    expect(observePayerIdentity).not.toHaveBeenCalled();
  });
});
