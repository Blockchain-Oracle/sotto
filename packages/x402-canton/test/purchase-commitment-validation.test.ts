import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  type BoundedPurchaseCommitmentInput,
} from "../src/index.js";
import {
  capturePaymentRequiredBytesForTest,
  readPaymentRequiredObservation,
} from "../src/payment-observation.js";
import {
  createPurchaseInput,
  replaceCapability,
} from "./purchase-commitment.fixtures.js";

const resourceUrl = "https://provider.example/paid/weather?units=metric";
const payerParty = "sotto-payer::1220payer";
const providerParty = "sotto-provider::1220provider";
const dsoParty = "DSO::1220dso";

function challengeBytes(
  requestCommitment: `sha256:${string}`,
  url = resourceUrl,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      x402Version: 2,
      resource: { url },
      accepts: [
        {
          scheme: "exact",
          network: "canton:devnet",
          amount: "2500000000",
          asset: "CC",
          payTo: providerParty,
          maxTimeoutSeconds: 60,
          extra: {
            assetTransferMethod: "transfer-factory",
            executeBeforeSeconds: 45,
            feePayer: payerParty,
            instrumentId: { admin: dsoParty, id: "Amulet" },
            memo: requestCommitment,
            synchronizerId: "global-domain::1220sync",
          },
        },
      ],
    }),
  );
}

function validInput(): BoundedPurchaseCommitmentInput {
  return createPurchaseInput();
}

type Mutation = (
  input: BoundedPurchaseCommitmentInput,
) => BoundedPurchaseCommitmentInput;

const invalidCases: ReadonlyArray<readonly [string, Mutation, string]> = [
  [
    "forged request binding",
    (input) => ({
      ...input,
      binding: {
        ...input.binding,
        commitment: `sha256:${"0".repeat(64)}`,
      },
    }),
    "binding commitment",
  ],
  [
    "authorization instance whitespace",
    (input) => ({ ...input, authorizationInstanceId: " authorization-7" }),
    "authorizationInstanceId",
  ],
  [
    "oversized decoded challenge",
    (input) => ({
      ...input,
      paymentObservation: capturePaymentRequiredBytesForTest(
        new TextEncoder().encode(
          `${new TextDecoder().decode(readPaymentRequiredObservation(input.paymentObservation).challengeBytes)}${" ".repeat(17_000)}`,
        ),
        "2026-07-13T10:00:00.000Z",
      ),
    }),
    "Decoded PAYMENT-REQUIRED",
  ],
  [
    "challenge resource mismatch",
    (input) => ({
      ...input,
      paymentObservation: capturePaymentRequiredBytesForTest(
        challengeBytes(
          input.binding.commitment,
          "https://provider.example/other",
        ),
        "2026-07-13T10:00:00.000Z",
      ),
    }),
    "resource URL",
  ],
  [
    "capability resource mismatch",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        resourceHash: `sha256:${"0".repeat(64)}`,
      })),
    "resource hash",
  ],
  [
    "capability recipient mismatch",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        recipient: "other::party",
      })),
    "recipient",
  ],
  [
    "amount beyond per-call limit",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        perCallLimitAtomic: "2499999999",
      })),
    "per-call limit",
  ],
  [
    "capability expires before challenge",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        expiresAt: "2026-07-13T10:00:44.999Z",
      })),
    "capability expiresAt",
  ],
  [
    "untrusted factory admin",
    (input) => ({
      ...input,
      tokenFactory: { ...input.tokenFactory, expectedAdmin: "other::admin" },
    }),
    "expected admin",
  ],
  [
    "unexpected root member",
    (input) =>
      ({ ...input, unexpected: true }) as BoundedPurchaseCommitmentInput,
    "input keys",
  ],
];

describe("commitBoundedPurchase validation", () => {
  it.each(invalidCases)("rejects %s", (_name, mutate, message) => {
    expect(() => commitBoundedPurchase(mutate(validInput()))).toThrow(message);
  });
});
