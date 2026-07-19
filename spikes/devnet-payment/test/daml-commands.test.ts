import { describe, expect, it } from "vitest";
import {
  buildConsumePolicyRequest,
  buildCreatePolicyRequest,
} from "../src/daml-commands.js";

const parties = {
  agent: "sotto-policy-agent::1220participant",
  owner: "sotto-policy-owner::1220participant",
  payer: "sotto-spike-payer::1220participant",
  provider: "sotto-spike-provider::1220participant",
};
const packageId = "f".repeat(64);
const policyTemplate = `${packageId}:Sotto.Control.PrivacyProbe:PurchasePolicyProbe`;

describe("Sotto Daml command construction", () => {
  it("creates the research policy with payer authority", () => {
    const request = buildCreatePolicyRequest({
      commandId: "sotto-policy-create-1",
      expiresAt: "2026-07-13T10:00:00.000Z",
      packageId,
      parties,
      resourceHash: `sha256:${"a".repeat(64)}`,
      userId: "6",
    });

    expect(request.actAs).toEqual([parties.payer]);
    expect(request.commands[0]).toMatchObject({
      CreateCommand: {
        templateId: policyTemplate,
        createArguments: {
          agent: parties.agent,
          allowedRecipient: parties.provider,
          owner: parties.owner,
          payer: parties.payer,
          perCallLimit: "0.2500000000",
          remainingLimit: "1.0000000000",
        },
      },
    });
  });

  it("consumes through joint agent and payer authority", () => {
    const request = buildConsumePolicyRequest({
      amount: "0.2500000000",
      attemptId: `sha256:${"b".repeat(64)}`,
      commandId: "sotto-policy-consume-1",
      packageId,
      parties,
      policyCid: "policy-cid",
      requestCommitment: `sha256:${"c".repeat(64)}`,
      resourceHash: `sha256:${"a".repeat(64)}`,
      userId: "6",
    });

    expect(request.actAs).toEqual([parties.agent, parties.payer]);
    expect(request.commands[0]).toMatchObject({
      ExerciseCommand: {
        choice: "Consume",
        choiceArgument: {
          amount: "0.2500000000",
          recipient: parties.provider,
        },
        contractId: "policy-cid",
        templateId: policyTemplate,
      },
    });
  });

  it("rejects a non-hash package identifier", () => {
    expect(() =>
      buildCreatePolicyRequest({
        commandId: "sotto-policy-create-invalid",
        expiresAt: "2026-07-13T10:00:00.000Z",
        packageId: "#sotto-control",
        parties,
        resourceHash: `sha256:${"a".repeat(64)}`,
        userId: "6",
      }),
    ).toThrow("package ID");
  });
});
