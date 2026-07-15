import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
} from "../src/index.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  preparedCapabilityBootstrapResponse,
} from "./prepared-capability-bootstrap.fixtures.js";
import { PREPARED_CAPABILITY_MUTATIONS } from "./prepared-capability-bootstrap-mutation.fixtures.js";

export function registerPreparedCapabilityBootstrapMutationCases(): void {
  describe("prepared capability exhaustive mutation matrix", () => {
    beforeEach(() =>
      vi.useFakeTimers({ now: Date.parse("2026-07-15T10:00:00.000Z") }),
    );
    afterEach(() => vi.useRealTimers());

    it.each(PREPARED_CAPABILITY_MUTATIONS)(
      "rejects changed %s before wallet use",
      async (_name, mutate) => {
        const request = buildBoundedCapabilityBootstrap(
          CAPABILITY_BOOTSTRAP_INPUT,
        );
        const wallet = vi.fn();
        const observe = createPreparedCapabilityBootstrapObserver(async () =>
          preparedCapabilityBootstrapResponse(request, undefined, mutate),
        );

        await expect(observe(request)).rejects.toThrow(/prepared capability/iu);
        expect(wallet).not.toHaveBeenCalled();
      },
    );

    it("rejects an unknown protobuf field", async () => {
      const request = buildBoundedCapabilityBootstrap(
        CAPABILITY_BOOTSTRAP_INPUT,
      );
      const observe = createPreparedCapabilityBootstrapObserver(async () =>
        preparedCapabilityBootstrapResponse(
          request,
          undefined,
          undefined,
          (bytes) => new Uint8Array([...bytes, 0x98, 0x06, 0x01]),
        ),
      );

      await expect(observe(request)).rejects.toThrow(
        /prepared capability.*protobuf/iu,
      );
    });

    it.each([
      ["user ID", (value: Record<string, unknown>) => (value.userId = "wrong")],
      [
        "readAs",
        (value: Record<string, unknown>) =>
          (value.readAs = [CAPABILITY_BOOTSTRAP_INPUT.agentParty]),
      ],
      [
        "package preference",
        (value: Record<string, unknown>) =>
          (value.packageIdSelectionPreference = ["f".repeat(64)]),
      ],
      [
        "unsupported workflow ID",
        (value: Record<string, unknown>) => (value.workflowId = "wrong"),
      ],
    ])("rejects caller-forged %s before prepare", async (_name, mutate) => {
      const request = buildBoundedCapabilityBootstrap(
        CAPABILITY_BOOTSTRAP_INPUT,
      );
      const forged = structuredClone(request) as unknown as Record<
        string,
        unknown
      >;
      mutate(forged);
      const reader = vi.fn(async () =>
        preparedCapabilityBootstrapResponse(request),
      );

      await expect(
        createPreparedCapabilityBootstrapObserver(reader)(forged as never),
      ).rejects.toThrow(/not authenticated/iu);
      expect(reader).not.toHaveBeenCalled();
    });
  });
}
