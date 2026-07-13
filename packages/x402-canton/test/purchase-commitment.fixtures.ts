import { createHash } from "node:crypto";
import {
  commitHttpRequest,
  type BoundedPurchaseCommitmentInput,
  type HttpRequestBindingInput,
} from "../src/index.js";
import {
  capturePaymentRequiredBytesForTest,
  readPaymentRequiredObservation,
} from "../src/payment-observation.js";

export const RESOURCE_URL =
  "https://provider.example/paid/weather?units=metric";
export const PAYER = "sotto-payer::1220payer";
export const PROVIDER = "sotto-provider::1220provider";
export const DSO = "DSO::1220dso";

export type ChallengeFixture = {
  accepts: Array<{
    amount: string;
    asset: string;
    extra: {
      assetTransferMethod: string;
      executeBeforeSeconds: number;
      feePayer: string;
      instrumentId: { admin: string; id: string };
      memo?: string;
      synchronizerId: string;
      [key: string]: unknown;
    };
    maxTimeoutSeconds: number;
    network: string;
    payTo: string;
    scheme: string;
    [key: string]: unknown;
  }>;
  resource: { url: string };
  x402Version: number;
};

export function routeHash(url: string): `sha256:${string}` {
  const resource = new URL(url);
  const preimage = JSON.stringify({
    version: "sotto-resource-v1",
    origin: resource.origin,
    pathname: resource.pathname,
  });
  return `sha256:${createHash("sha256").update(preimage).digest("hex")}`;
}

export function replaceBoundRequest(
  input: BoundedPurchaseCommitmentInput,
  request: HttpRequestBindingInput,
): BoundedPurchaseCommitmentInput {
  const binding = commitHttpRequest(request);
  const url = new URL(request.url).toString();
  return mutateChallenge(
    {
      ...input,
      binding,
      capability: {
        ...input.capability,
        resourceHash: routeHash(url),
      },
    },
    (challenge) => {
      challenge.resource.url = url;
      challenge.accepts[0]!.extra.memo = binding.commitment;
    },
  );
}

export function createPurchaseInput(): BoundedPurchaseCommitmentInput {
  const binding = commitHttpRequest({ method: "GET", url: RESOURCE_URL });
  const challenge: ChallengeFixture = {
    x402Version: 2,
    resource: { url: RESOURCE_URL },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: "2500000000",
        asset: "CC",
        payTo: PROVIDER,
        maxTimeoutSeconds: 60,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 45,
          feePayer: PAYER,
          instrumentId: { admin: DSO, id: "Amulet" },
          memo: binding.commitment,
          synchronizerId: "global-domain::1220sync",
        },
      },
    ],
  };
  return {
    authorizationInstanceId: "authorization-7",
    binding,
    capability: {
      contractId: "00capability7",
      revision: "7",
      resourceBindingVersion: "sotto-resource-v1",
      resourceHash: routeHash(RESOURCE_URL),
      recipient: PROVIDER,
      perCallLimitAtomic: "3000000000",
      remainingAllowanceAtomic: "10000000000",
      maximumTotalDebitAtomic: "2750000000",
      expiresAt: "2026-07-13T11:00:00.000Z",
    },
    expectedNetwork: "canton:devnet",
    paymentObservation: capturePaymentRequiredBytesForTest(
      new TextEncoder().encode(JSON.stringify(challenge)),
      "2026-07-13T10:00:00.000Z",
    ),
    payerParty: PAYER,
    tokenFactory: {
      interfaceId:
        "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",
      contractId: "00tokenfactory7",
      implementationTemplateId:
        "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules",
      expectedAdmin: DSO,
    },
  };
}

export function mutateChallenge(
  input: BoundedPurchaseCommitmentInput,
  mutate: (challenge: ChallengeFixture) => void,
): BoundedPurchaseCommitmentInput {
  const observation = readPaymentRequiredObservation(input.paymentObservation);
  const challenge = JSON.parse(
    new TextDecoder().decode(observation.challengeBytes),
  ) as ChallengeFixture;
  mutate(challenge);
  return {
    ...input,
    paymentObservation: capturePaymentRequiredBytesForTest(
      new TextEncoder().encode(JSON.stringify(challenge)),
      observation.observedAt,
    ),
  };
}

export function replaceChallengeObservation(
  input: BoundedPurchaseCommitmentInput,
  challengeBytes: Uint8Array,
  observedAt?: string,
): BoundedPurchaseCommitmentInput {
  const current = readPaymentRequiredObservation(input.paymentObservation);
  return {
    ...input,
    paymentObservation: capturePaymentRequiredBytesForTest(
      challengeBytes,
      observedAt ?? current.observedAt,
    ),
  };
}

export function readChallengeBytes(
  input: BoundedPurchaseCommitmentInput,
): Uint8Array {
  return readPaymentRequiredObservation(input.paymentObservation)
    .challengeBytes;
}
