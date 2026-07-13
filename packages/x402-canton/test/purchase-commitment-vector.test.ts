import { describe, expect, it } from "vitest";
import { commitHttpRequest } from "../src/request-binding.js";
import { commitBoundedPurchase } from "../src/purchase-commitment.js";

const resourceUrl = "https://provider.example/paid/weather?units=metric";
const binding = commitHttpRequest({
  body: new TextEncoder().encode('{"city":"Kigali"}'),
  headers: [
    ["content-type", "application/json"],
    ["idempotency-key", "purchase-7"],
  ],
  method: "POST",
  url: resourceUrl,
});
const requirement = {
  scheme: "exact",
  network: "canton:devnet",
  amount: "2500000000",
  asset: "CC",
  payTo: "sotto-provider::1220provider",
  maxTimeoutSeconds: 60,
  extra: {
    assetTransferMethod: "transfer-factory",
    executeBeforeSeconds: 45,
    feePayer: "facilitator::1220fee",
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    synchronizerId: "global-domain::1220sync",
  },
} as const;
const challengeBytes = new TextEncoder().encode(
  JSON.stringify({
    x402Version: 2,
    resource: { url: resourceUrl },
    accepts: [requirement],
  }),
);
const capability = {
  contractId: "00capability7",
  revision: "7",
  resourceHash:
    "sha256:e5b3a27139fbd1236d885f57e2995cf3a83c55df7e74374ec7f1ee2188e9dead",
  recipient: requirement.payTo,
  perCallLimitAtomic: "3000000000",
  remainingAllowanceAtomic: "10000000000",
  maximumTotalDebitAtomic: "2750000000",
  expiresAt: "2026-07-13T11:00:00.000Z",
} as const;
const tokenFactory = {
  interfaceId:
    "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",
  expectedAdmin: requirement.extra.instrumentId.admin,
} as const;

describe("commitBoundedPurchase", () => {
  it("produces the pinned sotto-purchase-v2 byte contract", () => {
    const result = commitBoundedPurchase({
      authorizationInstanceId: "authorization-7",
      binding,
      capability,
      challengeBytes,
      expectedNetwork: "canton:devnet",
      observedAt: "2026-07-13T10:00:00.000Z",
      payerParty: "sotto-payer::1220payer",
      tokenFactory,
    });
    const expectedCanonical = [
      '{"version":"sotto-purchase-v2","authorizationMode":"bounded-capability",',
      '"request":{"bindingVersion":"sotto-http-request-v1",',
      '"requestCommitment":"sha256:a2b8ec2dfeaf0f30def34a1b50de142496078626a93669e129236d2639c136b1",',
      '"bodyHash":"sha256:f5e6a33ee33f216decc18675ab9207a1ff30c128005183dfce8d0c87ca45de3e"},',
      '"challenge":{"x402Version":2,',
      '"challengeId":"sha256:4067955abbab62734dd2cd4779cf8013acdc93b33a2a29443ae7c6076f263fc6",',
      '"observedAt":"2026-07-13T10:00:00.000Z","expiresAt":"2026-07-13T10:00:45.000Z",',
      '"network":"canton:devnet","scheme":"exact","transferMethod":"transfer-factory",',
      '"payer":"sotto-payer::1220payer","recipient":"sotto-provider::1220provider",',
      '"amountAtomic":"2500000000","asset":"CC","feePayer":"facilitator::1220fee",',
      '"instrument":{"admin":"DSO::1220dso","id":"Amulet"},',
      '"synchronizerId":"global-domain::1220sync"},',
      '"capability":{"contractId":"00capability7","revision":"7",',
      '"resourceHash":"sha256:e5b3a27139fbd1236d885f57e2995cf3a83c55df7e74374ec7f1ee2188e9dead",',
      '"recipient":"sotto-provider::1220provider","perCallLimitAtomic":"3000000000",',
      '"remainingAllowanceAtomic":"10000000000","maximumTotalDebitAtomic":"2750000000",',
      '"expiresAt":"2026-07-13T11:00:00.000Z"},',
      '"tokenFactory":{"interfaceId":"55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",',
      '"expectedAdmin":"DSO::1220dso"},"authorizationInstanceId":"authorization-7",',
      '"attemptId":"sha256:306b4df89707e150c79d03e251d903001c018c05a8d1e53dd819817536bd042d"}',
    ].join("");

    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(
      expectedCanonical,
    );
    expect(result).toMatchObject({
      attemptId:
        "sha256:306b4df89707e150c79d03e251d903001c018c05a8d1e53dd819817536bd042d",
      challengeId:
        "sha256:4067955abbab62734dd2cd4779cf8013acdc93b33a2a29443ae7c6076f263fc6",
      commitment:
        "sha256:79ff8f5ef3af28267d8a04607af490d03c6daefc28d3a9bf3716aefc36098a7c",
      expiresAt: "2026-07-13T10:00:45.000Z",
      version: "sotto-purchase-v2",
    });

    const reordered = commitBoundedPurchase({
      tokenFactory: {
        expectedAdmin: tokenFactory.expectedAdmin,
        interfaceId: tokenFactory.interfaceId,
      },
      payerParty: "sotto-payer::1220payer",
      observedAt: "2026-07-13T10:00:00.000Z",
      expectedNetwork: "canton:devnet",
      challengeBytes,
      capability: {
        expiresAt: capability.expiresAt,
        maximumTotalDebitAtomic: capability.maximumTotalDebitAtomic,
        remainingAllowanceAtomic: capability.remainingAllowanceAtomic,
        perCallLimitAtomic: capability.perCallLimitAtomic,
        recipient: capability.recipient,
        resourceHash: capability.resourceHash,
        revision: capability.revision,
        contractId: capability.contractId,
      },
      binding,
      authorizationInstanceId: "authorization-7",
    });
    expect(reordered.canonicalBytes).toEqual(result.canonicalBytes);
    expect(reordered.commitment).toBe(result.commitment);
  });
});
