import { describe, expect, it } from "vitest";
import { preparedSynchronizerMatches } from "../src/prepared-synchronizer.js";

const LOGICAL = "global-domain::1220synchronizer";

describe("prepared synchronizer identity", () => {
  it.each([LOGICAL, `${LOGICAL}::35-3`])(
    "accepts %s for the exact logical synchronizer",
    (prepared) => {
      expect(preparedSynchronizerMatches(prepared, LOGICAL)).toBe(true);
    },
  );

  it.each([
    `${LOGICAL}-attacker::35-3`,
    `${LOGICAL}::035-3`,
    `${LOGICAL}::35-03`,
    `${LOGICAL}::35-3-extra`,
    `${LOGICAL}::35-3::extra`,
    `${LOGICAL}::${"1".repeat(11)}-3`,
    "other-domain::1220synchronizer::35-3",
  ])("rejects non-identical physical synchronizer %s", (prepared) => {
    expect(preparedSynchronizerMatches(prepared, LOGICAL)).toBe(false);
  });
});
