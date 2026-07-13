import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  commitHttpRequest,
  type BoundedPurchaseCommitmentInput,
} from "../src/index.js";
import {
  capturePaymentRequiredBytesForTest,
  readPaymentRequiredObservation,
} from "../src/payment-observation.js";

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
  const binding = commitHttpRequest({ method: "GET", url: resourceUrl });
  return {
    authorizationInstanceId: "authorization-7",
    binding,
    capability: {
      contractId: "00capability7",
      revision: "7",
      resourceBindingVersion: "sotto-resource-v1",
      resourceHash:
        "sha256:f8fe5b158e6d56ef4b320ace4f94600f36c6401e69604469ebc20e45f42605bc",
      recipient: providerParty,
      perCallLimitAtomic: "3000000000",
      remainingAllowanceAtomic: "10000000000",
      maximumTotalDebitAtomic: "2750000000",
      expiresAt: "2026-07-13T11:00:00.000Z",
    },
    expectedNetwork: "canton:devnet",
    paymentObservation: capturePaymentRequiredBytesForTest(
      challengeBytes(binding.commitment),
      "2026-07-13T10:00:00.000Z",
    ),
    payerParty,
    tokenFactory: {
      interfaceId:
        "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",
      contractId: "00tokenfactory7",
      implementationTemplateId:
        "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules",
      expectedAdmin: dsoParty,
    },
  };
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
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        resourceHash: `sha256:${"0".repeat(64)}`,
      },
    }),
    "resource hash",
  ],
  [
    "capability recipient mismatch",
    (input) => ({
      ...input,
      capability: { ...input.capability, recipient: "other::party" },
    }),
    "recipient",
  ],
  [
    "amount beyond per-call limit",
    (input) => ({
      ...input,
      capability: { ...input.capability, perCallLimitAtomic: "2499999999" },
    }),
    "per-call limit",
  ],
  [
    "capability expires before challenge",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        expiresAt: "2026-07-13T10:00:44.999Z",
      },
    }),
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
