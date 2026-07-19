import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "../src/index.js";
import { CAPABILITY_BOOTSTRAP_INPUT } from "./prepared-capability-bootstrap.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

describe("bounded capability bootstrap network", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("accepts the exact 128-byte canonical boundary", () => {
    const network = `canton:${"a".repeat(121)}` as const;

    expect(
      buildBoundedCapabilityBootstrap({
        ...CAPABILITY_BOOTSTRAP_INPUT,
        network,
      }),
    ).toBeDefined();
  });

  it.each([
    ["over limit", `canton:${"a".repeat(122)}`],
    ["leading separator", "canton:-devnet"],
    ["trailing separator", "canton:devnet-"],
    ["ambiguous separators", "canton:devnet..wallet"],
    ["uppercase", "canton:DevNet"],
    ["space", "canton:dev net"],
    ["newline injection", "canton:devnet\nrecipient:attacker"],
    ["Unicode lookalike", "canton:devnеt"],
  ])("rejects %s", (_label, network) => {
    expect(() =>
      buildBoundedCapabilityBootstrap({
        ...CAPABILITY_BOOTSTRAP_INPUT,
        network: network as `canton:${string}`,
      }),
    ).toThrow(/canonical Canton network/iu);
  });
});
