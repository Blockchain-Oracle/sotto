import { describe, expect, it } from "vitest";
import { buildFiveNorthPreapprovalProposal } from "../src/five-north-preapproval-proposal.js";
import {
  exportFiveNorthPreapprovalIntent,
  restoreFiveNorthPreapprovalIntent,
} from "../src/five-north-preapproval-intent.js";

const input = {
  expectedDso: `DSO::1220${"3".repeat(64)}`,
  packageId: "f".repeat(64),
  receiverParty: `sotto-spike-provider::1220${"1".repeat(64)}`,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
  userId: "ledger-user-6",
  validatorParty: `five-north-validator::1220${"2".repeat(64)}`,
} as const;

describe("Five North preapproval durable intent", () => {
  it("round-trips one authenticated proposal through an exact source-pinned intent", () => {
    const request = buildFiveNorthPreapprovalProposal(input);
    const intent = exportFiveNorthPreapprovalIntent(request, "a".repeat(40));

    expect(intent).toMatchObject({
      input,
      request,
      schema: "sotto-transfer-preapproval-intent-v1",
      sourceCommit: "a".repeat(40),
    });
    expect(restoreFiveNorthPreapprovalIntent(structuredClone(intent))).toEqual(
      request,
    );
  });

  it("rejects a mutated request, input, schema, or source commit", () => {
    const request = buildFiveNorthPreapprovalProposal(input);
    const intent = exportFiveNorthPreapprovalIntent(request, "a".repeat(40));

    for (const mutated of [
      { ...intent, sourceCommit: "short" },
      { ...intent, schema: "future" },
      { ...intent, input: { ...intent.input, userId: "other-user" } },
      { ...intent, request: { ...intent.request, commandId: "mutated" } },
    ]) {
      expect(() => restoreFiveNorthPreapprovalIntent(mutated)).toThrow();
    }
  });
});
