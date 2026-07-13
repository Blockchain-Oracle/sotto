import { describe, expect, it } from "vitest";
import { commitBoundedPurchase } from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
} from "./purchase-commitment.fixtures.js";

describe("commitBoundedPurchase security validation", () => {
  it("rejects a duplicate JSON key in the decoded challenge", () => {
    const input = createPurchaseInput();
    const text = new TextDecoder()
      .decode(input.challengeBytes)
      .replace(
        '"network":"canton:devnet"',
        '"network":"other","network":"canton:devnet"',
      );

    expect(() =>
      commitBoundedPurchase({
        ...input,
        challengeBytes: new TextEncoder().encode(text),
      }),
    ).toThrow("duplicate JSON key");
  });

  it("rejects escaped-equivalent duplicate JSON keys", () => {
    const input = createPurchaseInput();
    const text = new TextDecoder()
      .decode(input.challengeBytes)
      .replace(
        '"network":"canton:devnet"',
        '"netw\\u006frk":"other","network":"canton:devnet"',
      );

    expect(() =>
      commitBoundedPurchase({
        ...input,
        challengeBytes: new TextEncoder().encode(text),
      }),
    ).toThrow("duplicate JSON key");
  });

  it("rejects excessive challenge nesting", () => {
    const input = createPurchaseInput();
    const challenge = JSON.parse(
      new TextDecoder().decode(input.challengeBytes),
    );
    challenge.padding = JSON.parse(`${"[".repeat(33)}null${"]".repeat(33)}`);

    expect(() =>
      commitBoundedPurchase({
        ...input,
        challengeBytes: new TextEncoder().encode(JSON.stringify(challenge)),
      }),
    ).toThrow("structural limits");
  });

  it("rejects an unbounded accepts collection before selection", () => {
    const input = mutateChallenge(createPurchaseInput(), (challenge) => {
      challenge.accepts = Array.from({ length: 33 }, () =>
        structuredClone(challenge.accepts[0]!),
      );
    });

    expect(() => commitBoundedPurchase(input)).toThrow("at most 32 accepts");
  });

  it.each([
    [
      "requirement",
      (input: ReturnType<typeof createPurchaseInput>) =>
        mutateChallenge(input, (challenge) => {
          challenge.accepts[0]!.uncommitted = "value";
        }),
    ],
    [
      "requirement extra",
      (input: ReturnType<typeof createPurchaseInput>) =>
        mutateChallenge(input, (challenge) => {
          challenge.accepts[0]!.extra.uncommitted = "value";
        }),
    ],
    [
      "instrument",
      (input: ReturnType<typeof createPurchaseInput>) =>
        mutateChallenge(input, (challenge) => {
          Object.assign(challenge.accepts[0]!.extra.instrumentId, {
            uncommitted: "value",
          });
        }),
    ],
  ] as const)("rejects an unknown %s member", (_name, mutate) => {
    expect(() => commitBoundedPurchase(mutate(createPurchaseInput()))).toThrow(
      "keys",
    );
  });

  it("rejects a missing request-commitment carrier", () => {
    const input = mutateChallenge(createPurchaseInput(), (challenge) => {
      delete challenge.accepts[0]!.extra.memo;
    });

    expect(() => commitBoundedPurchase(input)).toThrow("memo");
  });

  it("rejects a fee payer different from the authorized payer", () => {
    const input = mutateChallenge(createPurchaseInput(), (challenge) => {
      challenge.accepts[0]!.extra.feePayer = "other::payer";
    });

    expect(() => commitBoundedPurchase(input)).toThrow("fee payer");
  });

  it("rejects an unpaired surrogate in an identifier", () => {
    const input = createPurchaseInput();

    expect(() =>
      commitBoundedPurchase({
        ...input,
        authorizationInstanceId: "authorization-\ud800",
      }),
    ).toThrow("authorizationInstanceId");
  });

  it("rejects a challenge window that overflows canonical time", () => {
    const input = mutateChallenge(createPurchaseInput(), (challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = Number.MAX_SAFE_INTEGER;
      challenge.accepts[0]!.extra.executeBeforeSeconds =
        Number.MAX_SAFE_INTEGER;
    });

    expect(() => commitBoundedPurchase(input)).toThrow("purchase window");
  });
});
