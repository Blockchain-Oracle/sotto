import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  type BoundedPurchaseCommitmentInput,
} from "../src/index.js";
import {
  AGENT,
  CAPABILITY_TEMPLATE_ID,
  createPurchaseInput,
  PAYER,
  replaceCapability,
} from "./purchase-commitment.fixtures.js";
import { replacePackageSelection } from "./purchase-package-selection.fixtures.js";

function withAgent(
  agentParty: string,
  bindSelection = true,
): BoundedPurchaseCommitmentInput {
  const input = replaceCapability(createPurchaseInput(), (capability) => ({
    ...capability,
    agentParty,
    templateId: CAPABILITY_TEMPLATE_ID,
  }));
  return bindSelection
    ? replacePackageSelection(input, (selection) => {
        selection.parties = selection.parties
          .map((party) => (party === AGENT ? agentParty : party))
          .sort();
      })
    : input;
}

describe("bounded purchase agent authority", () => {
  it("commits the only party allowed to exercise Purchase", () => {
    const first = commitBoundedPurchase(withAgent(AGENT));
    const changed = commitBoundedPurchase(
      withAgent("sotto-agent-2::1220agent"),
    );

    expect(new TextDecoder().decode(first.canonicalBytes)).toContain(
      `"agentParty":"${AGENT}"`,
    );
    expect(changed.attemptId).not.toBe(first.attemptId);
    expect(changed.commitment).not.toBe(first.commitment);
  });

  it("rejects a capability whose payer is also its agent", () => {
    expect(() => commitBoundedPurchase(withAgent(PAYER))).toThrow(
      "capability agent must differ from payer",
    );
  });

  it("rejects a substituted capability template", () => {
    expect(() =>
      commitBoundedPurchase(
        replaceCapability(withAgent(AGENT), (capability) => ({
          ...capability,
          templateId: `${"a".repeat(64)}:Other.Module:OtherTemplate`,
        })),
      ),
    ).toThrow("capability templateId");
  });

  it.each(["", ` ${AGENT}`, "x".repeat(513)])(
    "rejects invalid agent Party %j",
    (agentParty) => {
      expect(() => commitBoundedPurchase(withAgent(agentParty, false))).toThrow(
        "capability agentParty",
      );
    },
  );
});
