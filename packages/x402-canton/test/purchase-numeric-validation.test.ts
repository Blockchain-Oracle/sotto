import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  type BoundedPurchaseCommitmentInput,
} from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
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
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        remainingAllowanceAtomic: "2499999999",
      },
    }),
    "remaining allowance",
  ],
  [
    "amount above maximum debit",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        maximumTotalDebitAtomic: "2499999999",
      },
    }),
    "maximum total debit",
  ],
  [
    "negative per-call limit",
    (input) => ({
      ...input,
      capability: { ...input.capability, perCallLimitAtomic: "-1" },
    }),
    "bounded atomic",
  ],
  [
    "leading-zero remaining",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        remainingAllowanceAtomic: "010000000000",
      },
    }),
    "bounded atomic",
  ],
  [
    "39-digit maximum debit",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        maximumTotalDebitAtomic: "9".repeat(39),
      },
    }),
    "bounded atomic",
  ],
  [
    "negative revision",
    (input) => ({
      ...input,
      capability: { ...input.capability, revision: "-1" },
    }),
    "bounded integer",
  ],
  [
    "leading-zero revision",
    (input) => ({
      ...input,
      capability: { ...input.capability, revision: "01" },
    }),
    "bounded integer",
  ],
  [
    "Daml Int revision overflow",
    (input) => ({
      ...input,
      capability: { ...input.capability, revision: "9223372036854775808" },
    }),
    "bounded integer",
  ],
  [
    "noncanonical capability expiry",
    (input) => ({
      ...input,
      capability: { ...input.capability, expiresAt: "2026-07-13T11:00:00Z" },
    }),
    "capability expiresAt",
  ],
  [
    "malformed body hash",
    (input) => ({ ...input, binding: { ...input.binding, bodySha256: "bad" } }),
    "binding commitment",
  ],
  [
    "malformed resource hash",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        resourceHash: "bad" as `sha256:${string}`,
      },
    }),
    "resource hash",
  ],
  [
    "null capability",
    (input) => ({ ...input, capability: null }) as never,
    "capability must be an object",
  ],
  [
    "missing capability member",
    (input) => {
      const { recipient: _removed, ...capability } = input.capability;
      void _removed;
      return { ...input, capability } as never;
    },
    "capability keys",
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
