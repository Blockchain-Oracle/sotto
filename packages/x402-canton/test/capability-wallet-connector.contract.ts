import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../src/index.js";
import { claimApprovedCapabilityWalletSigningSession } from "../src/capability-wallet-signing-session.js";
import {
  CAPABILITY_WALLET_CONTRACT_NOW,
  capabilityWalletContractSessionInput as sessionInput,
  expectedCapabilityWalletContractApproval,
  recordingContractConnector as recording,
  type CapabilityWalletConnectorContractHarness,
} from "./capability-wallet-connector-contract-support.js";
import { registerCapabilityWalletConnectorTimingCases } from "./capability-wallet-connector-contract-timing.cases.js";

export function registerCapabilityWalletConnectorContract(
  harness: CapabilityWalletConnectorContractHarness,
): void {
  describe(`${harness.label} conformance`, () => {
    beforeEach(() => vi.useFakeTimers({ now: CAPABILITY_WALLET_CONTRACT_NOW }));
    afterEach(() => vi.useRealTimers());

    it("discovers exact scope before one explicit sign", async () => {
      const prepared = await harness.createPrepared();
      const expectedApproval =
        expectedCapabilityWalletContractApproval(prepared);
      const scenario = harness.createScenario();
      const observed = recording(scenario.connector);
      const result = await createCapabilityWalletSigningSession(
        sessionInput(harness, observed.connector, prepared),
      );

      expect(observed.discover).toHaveBeenCalledOnce();
      expect(observed.requestApproval).toHaveBeenCalledOnce();
      expect(observed.discover.mock.calls[0]![0]).toEqual({
        signal: expect.any(AbortSignal),
      });
      const [request, options] = observed.requestApproval.mock.calls[0]!;
      expect(options).toEqual({ signal: expect.any(AbortSignal) });
      expect(request).toMatchObject({
        connectorId: harness.connectorId,
        connectorOrigin: harness.connectorOrigin,
        preparedTransaction: expect.any(Uint8Array),
        preparedTransactionHash: expect.stringMatching(
          /^sha256:[0-9a-f]{64}$/u,
        ),
      });
      expect(request.approval).toEqual(expectedApproval);
      expect(scenario.probe.presentedRequest()?.approval).toEqual(
        expectedApproval,
      );
      expect(scenario.probe.presentedRequest()?.preparedTransactionHash).toBe(
        request.preparedTransactionHash,
      );
      expect(request).not.toHaveProperty("actAs");
      expect(request).not.toHaveProperty("userId");
      expect(result).toMatchObject({
        connectorKind: harness.connectorKind,
        outcome: "approved",
        origin: harness.connectorOrigin,
      });
      expect(scenario.probe.signCalls()).toBe(1);
    });

    it("rejects explicitly with zero signing", async () => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ approval: "reject" });
      const result = await createCapabilityWalletSigningSession(
        sessionInput(harness, scenario.connector, prepared),
      );

      expect(result).toMatchObject({
        outcome: "rejected",
        reason: "user-rejected",
      });
      expect(result).not.toHaveProperty("signature");
      expect(scenario.probe.signCalls()).toBe(0);
    });

    it("isolates transport mutation from authenticated material", async () => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ approval: "mutate" });
      const result = await createCapabilityWalletSigningSession(
        sessionInput(harness, scenario.connector, prepared),
      );
      const claimed = claimApprovedCapabilityWalletSigningSession(result);

      expect(claimed.preparedTransaction).toEqual(
        scenario.probe.requestBytesBeforeMutation(),
      );
      expect(scenario.probe.signCalls()).toBe(1);
    });

    it("rejects changed transport origin before signing", async () => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ discovery: "changed-origin" });
      const observed = recording(scenario.connector);

      await expect(
        createCapabilityWalletSigningSession(
          sessionInput(harness, observed.connector, prepared),
        ),
      ).rejects.toThrow(/identity/iu);
      expect(observed.requestApproval).not.toHaveBeenCalled();
      expect(scenario.probe.signCalls()).toBe(0);
    });

    it("rejects replay before adapter discovery", async () => {
      const prepared = await harness.createPrepared();
      const first = harness.createScenario();
      await createCapabilityWalletSigningSession(
        sessionInput(harness, first.connector, prepared),
      );
      const replay = harness.createScenario();
      const observed = recording(replay.connector);

      await expect(
        createCapabilityWalletSigningSession(
          sessionInput(harness, observed.connector, prepared),
        ),
      ).rejects.toThrow(/claimed/iu);
      expect(observed.discover).not.toHaveBeenCalled();
      expect(replay.probe.signCalls()).toBe(0);
    });

    it("rejects malformed adapter response", async () => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ approval: "malformed" });
      await expect(
        createCapabilityWalletSigningSession(
          sessionInput(harness, scenario.connector, prepared),
        ),
      ).rejects.toThrow(/signature|keys/iu);
    });

    it("performs zero signing for unsupported discovery", async () => {
      const prepared = await harness.createPrepared();
      const scenario = harness.createScenario({ discovery: "unsupported" });
      const observed = recording(scenario.connector);
      await expect(
        createCapabilityWalletSigningSession(
          sessionInput(harness, observed.connector, prepared),
        ),
      ).resolves.toMatchObject({ outcome: "unsupported" });
      expect(observed.requestApproval).not.toHaveBeenCalled();
      expect(scenario.probe.signCalls()).toBe(0);
    });

    registerCapabilityWalletConnectorTimingCases(harness);
  });
}
