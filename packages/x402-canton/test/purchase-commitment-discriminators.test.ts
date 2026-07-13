import { describe, expect, it } from "vitest";
import type { BoundedPurchaseCommitmentInput } from "../src/index.js";
import { commitBoundedPurchase } from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
  replaceCapability,
} from "./purchase-commitment.fixtures.js";

type RejectedMutation = (
  input: BoundedPurchaseCommitmentInput,
) => BoundedPurchaseCommitmentInput;

const rejected: ReadonlyArray<readonly [string, RejectedMutation, string]> = [
  [
    "request-binding version",
    (input) =>
      ({ ...input, binding: { ...input.binding, version: "other" } }) as never,
    "binding commitment",
  ],
  [
    "x402 version",
    (input) => mutateChallenge(input, (value) => (value.x402Version = 1)),
    "x402Version 2",
  ],
  [
    "payment scheme",
    (input) =>
      mutateChallenge(input, (value) => (value.accepts[0]!.scheme = "other")),
    "matching Canton requirement",
  ],
  [
    "transfer method",
    (input) =>
      mutateChallenge(
        input,
        (value) =>
          (value.accepts[0]!.extra.assetTransferMethod =
            "amulet-rules-transfer"),
      ),
    "transfer-factory",
  ],
  [
    "resource-binding version",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        resourceBindingVersion: "other",
      })),
    "resource binding version",
  ],
  [
    "factory interface",
    (input) =>
      ({
        ...input,
        tokenFactory: { ...input.tokenFactory, interfaceId: "other" },
      }) as never,
    "pinned TransferFactory",
  ],
  [
    "factory implementation",
    (input) =>
      ({
        ...input,
        tokenFactory: {
          ...input.tokenFactory,
          implementationTemplateId: "other",
        },
      }) as never,
    "implementation is not approved",
  ],
];

describe("sotto-purchase-v2 fixed discriminators", () => {
  it.each(rejected)("rejects a changed %s", (_name, mutate, message) => {
    expect(() => commitBoundedPurchase(mutate(createPurchaseInput()))).toThrow(
      message,
    );
  });
});
