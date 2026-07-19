import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../src/index.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
  verifiedCapabilityBootstrap,
} from "./capability-wallet-connector.fixtures.js";

describe("capability wallet approval persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
  });
  afterEach(() => vi.useRealTimers());

  it("persists the redacted session identity before wallet approval", async () => {
    const events: string[] = [];
    const onApprovalRequested = vi.fn(async () => {
      events.push("persisted");
    });
    const requestApproval = vi.fn(async () => {
      events.push("approval");
      return APPROVED_SIGNATURE;
    });

    await createCapabilityWalletSigningSession({
      connector: {
        discover: async () => CONNECTOR_CAPABILITIES,
        requestApproval,
      },
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      onApprovalRequested,
      prepared: await verifiedCapabilityBootstrap(),
      timeoutMilliseconds: 1_000,
    });

    expect(events).toEqual(["persisted", "approval"]);
    expect(onApprovalRequested).toHaveBeenCalledWith({
      connectorId: CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      sessionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
  });

  it("redacts persistence failure and never opens the wallet", async () => {
    const requestApproval = vi.fn();

    await expect(
      createCapabilityWalletSigningSession({
        connector: {
          discover: async () => CONNECTOR_CAPABILITIES,
          requestApproval,
        },
        connectorId: CONNECTOR_ID,
        connectorOrigin: CONNECTOR_ORIGIN,
        onApprovalRequested: async () => {
          throw new Error("private journal detail");
        },
        prepared: await verifiedCapabilityBootstrap(),
        timeoutMilliseconds: 1_000,
      }),
    ).rejects.toEqual(
      new Error("capability wallet approval persistence failed"),
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });
});
