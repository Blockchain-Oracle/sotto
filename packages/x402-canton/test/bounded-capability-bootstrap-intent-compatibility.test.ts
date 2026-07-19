import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  exportBoundedCapabilityBootstrapIntent,
  restoreBoundedCapabilityBootstrapIntent,
} from "../src/index.js";
import {
  LEGACY_BOOTSTRAP_COMMAND_ID,
  LEGACY_DIRECT_BOOTSTRAP_INTENT_V1,
  LEGACY_PREPARED_BOOTSTRAP_INTENT_V1,
} from "./bounded-capability-bootstrap-intent-v1.fixture.js";
import { CAPABILITY_BOOTSTRAP_INPUT } from "./prepared-capability-bootstrap.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");
const legacyOptions = { legacyNetwork: "canton:devnet" as const };

describe("bounded capability bootstrap intent compatibility", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("exports and restores the network-bound v2 schema", () => {
    const request = buildBoundedCapabilityBootstrap(CAPABILITY_BOOTSTRAP_INPUT);
    const intent = exportBoundedCapabilityBootstrapIntent(
      request,
      "b".repeat(40),
    );

    expect(intent).toMatchObject({
      network: "canton:devnet",
      schema: "sotto-capability-bootstrap-intent-v2",
    });
    expect(restoreBoundedCapabilityBootstrapIntent(intent)).toEqual(request);
  });

  it.each([
    ["direct", LEGACY_DIRECT_BOOTSTRAP_INTENT_V1],
    ["prepared", LEGACY_PREPARED_BOOTSTRAP_INTENT_V1],
  ])(
    "migrates a frozen historical %s v1 without changing identity",
    (_label, intent) => {
      const restored = restoreBoundedCapabilityBootstrapIntent(
        structuredClone(intent),
        legacyOptions,
      );

      expect(restored.commandId).toBe(LEGACY_BOOTSTRAP_COMMAND_ID);
      expect(restored.workflowId).toBe("sotto-capability-bootstrap-v1");
      expect(Object.keys(restored).sort()).toEqual(
        [
          "actAs",
          "commandId",
          "commands",
          "packageIdSelectionPreference",
          "readAs",
          "synchronizerId",
          "userId",
          "workflowId",
        ].sort(),
      );
    },
  );

  it("requires an explicit trusted network for historical v1", () => {
    expect(() =>
      restoreBoundedCapabilityBootstrapIntent(
        LEGACY_DIRECT_BOOTSTRAP_INTENT_V1,
      ),
    ).toThrow(/legacy.*network.*required/iu);
  });

  it("rejects a historical command identity mutation", () => {
    expect(() =>
      restoreBoundedCapabilityBootstrapIntent(
        {
          ...LEGACY_DIRECT_BOOTSTRAP_INTENT_V1,
          request: {
            ...LEGACY_DIRECT_BOOTSTRAP_INTENT_V1.request,
            commandId: `sotto-capability-bootstrap-v1-${"0".repeat(64)}`,
          },
        },
        legacyOptions,
      ),
    ).toThrow(/legacy.*command.*does not match/iu);
  });
});
