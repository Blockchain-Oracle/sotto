import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  type BoundedPurchaseCommitmentInput,
} from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
  replaceCapability,
} from "./purchase-commitment.fixtures.js";

type Mutation = (
  input: BoundedPurchaseCommitmentInput,
) => BoundedPurchaseCommitmentInput;

const malformed: ReadonlyArray<readonly [string, Mutation, string]> = [
  [
    "zero amount",
    (input) =>
      mutateChallenge(input, (value) => (value.accepts[0]!.amount = "0")),
    "positive",
  ],
  [
    "negative amount",
    (input) =>
      mutateChallenge(input, (value) => (value.accepts[0]!.amount = "-1")),
    "atomic integer",
  ],
  [
    "leading-zero amount",
    (input) =>
      mutateChallenge(input, (value) => (value.accepts[0]!.amount = "01")),
    "atomic integer",
  ],
  [
    "39-digit amount",
    (input) =>
      mutateChallenge(
        input,
        (value) => (value.accepts[0]!.amount = "1".repeat(39)),
      ),
    "bounded atomic",
  ],
  [
    "amount above remaining",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        remainingAllowanceAtomic: "2499999999",
      })),
    "remaining allowance",
  ],
  [
    "amount above maximum debit",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        maximumTotalDebitAtomic: "2499999999",
      })),
    "maximum total debit",
  ],
  [
    "malformed body hash",
    (input) => ({ ...input, binding: { ...input.binding, bodySha256: "bad" } }),
    "binding commitment",
  ],
  [
    "null capability",
    (input) => ({ ...input, capability: null }) as never,
    "capability observation is not authenticated",
  ],
  [
    "missing factory member",
    (input) => {
      const { contractId: _removed, ...tokenFactory } = input.tokenFactory;
      void _removed;
      return { ...input, tokenFactory } as never;
    },
    "tokenFactory keys",
  ],
];

describe("bounded purchase numeric and structural validation", () => {
  it.each(malformed)("rejects %s", (_name, mutate, message) => {
    expect(() => commitBoundedPurchase(mutate(createPurchaseInput()))).toThrow(
      message,
    );
  });
});
