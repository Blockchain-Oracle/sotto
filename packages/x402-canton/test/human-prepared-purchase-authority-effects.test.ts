import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureIdentifier } from "./prepared-purchase-value.fixtures.js";
import { fixtureScalar } from "./prepared-purchase-value.fixtures.js";
import { HISTORICAL_HOLDING_TEMPLATE_ID } from "./prepared-purchase-effect-values.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";
import {
  humanPreparedExercise,
  humanPreparedFetch,
  humanPreparedInput,
  humanPreparedReplaceField,
  inspectHumanPreparedMutation,
} from "./human-prepared-purchase-effect-test-support.js";

describe("human prepared transfer authority effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects the historical input Holding Archive template", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        humanPreparedExercise(prepared, "2").templateId = fixtureIdentifier(
          HISTORICAL_HOLDING_TEMPLATE_ID,
        );
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects a stakeholder substituted for the DSO fetch actor", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const fetch = humanPreparedFetch(prepared, "6");
        fetch.actingParties = [fetch.stakeholders[1]!];
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects the receiver acting on the root preapproval fetch", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const fetch = humanPreparedFetch(prepared, "9");
        fetch.actingParties = [fetch.stakeholders[1]!];
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects incomplete root Holding fetch authority", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const fetch = humanPreparedFetch(prepared, "12");
        fetch.actingParties = [fetch.actingParties[0]!];
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects incomplete inner Holding fetch authority", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const fetch = humanPreparedFetch(prepared, "13");
        fetch.actingParties = [fetch.actingParties[0]!];
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects a substituted preapproval manager", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const attacker = "attacker::1220attacker";
        const input = humanPreparedInput(
          prepared,
          EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
        );
        const exercise = humanPreparedExercise(prepared, "1");
        input.signatories[2] = attacker;
        input.stakeholders[2] = attacker;
        exercise.signatories[2] = attacker;
        exercise.stakeholders[2] = attacker;
      }),
    ).rejects.toThrow(/prepared/iu);
  });

  it("rejects a Featured App right for a different manager", async () => {
    await expect(
      inspectHumanPreparedMutation((prepared) => {
        const input = humanPreparedInput(
          prepared,
          EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
        );
        humanPreparedReplaceField(
          input.argument,
          "provider",
          fixtureScalar("party", "other-manager::1220other"),
        );
      }),
    ).rejects.toThrow(/prepared/iu);
  });
});
