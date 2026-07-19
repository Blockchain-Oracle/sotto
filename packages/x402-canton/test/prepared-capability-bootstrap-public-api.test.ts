import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";

describe("prepared capability public API", () => {
  it("exports only the connector-safe verification boundary", () => {
    for (const name of [
      "createPreparedCapabilityBootstrapObserver",
      "verifyPreparedCapabilityBootstrapHash",
      "projectPreparedCapabilityBootstrapApproval",
      "claimHashVerifiedPreparedCapabilityBootstrap",
    ]) {
      expect(publicApi, name).toHaveProperty(name, expect.any(Function));
    }
    expect(publicApi).toMatchObject({
      MAX_PREPARED_CAPABILITY_RESPONSE_BYTES: 3_145_728,
      MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES: 2_097_152,
      PREPARED_CAPABILITY_APPROVAL_VERSION: "sotto-capability-approval-v1",
      PREPARED_CAPABILITY_BOOTSTRAP_PATH: "/v2/interactive-submission/prepare",
      PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS: 10_000,
    });
  });

  it("does not export raw state readers or mutable authority maps", () => {
    for (const name of [
      "readPreparedCapabilityBootstrapObservation",
      "claimPreparedCapabilityBootstrapObservation",
      "readHashVerifiedPreparedCapabilityBootstrap",
      "boundedCapabilityBootstrapState",
      "registerBoundedCapabilityBootstrap",
      "buildBoundedCapabilityBootstrapPrepareRequest",
    ]) {
      expect(publicApi, name).not.toHaveProperty(name);
    }
  });
});
