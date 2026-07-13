import { describe, expect, it } from "vitest";
import { commitHttpRequest } from "../src/request-binding.js";
import { commitBoundedPurchase } from "../src/purchase-commitment.js";
import { capturePaymentRequiredBytesForTest } from "../src/payment-observation.js";
import { captureCapability } from "./purchase-commitment.fixtures.js";
import { CAPABILITY_TEMPLATE_ID } from "./purchase-commitment.fixtures.js";

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
    feePayer: "sotto-payer::1220payer",
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    memo: binding.commitment,
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
const paymentObservation = capturePaymentRequiredBytesForTest(
  challengeBytes,
  "2026-07-13T10:00:00.000Z",
);
const capability = {
  agentParty: "sotto-agent::1220agent",
  contractId: "00capability7",
  expectedAdmin: requirement.extra.instrumentId.admin,
  templateId: CAPABILITY_TEMPLATE_ID,
  payerParty: requirement.extra.feePayer,
  paused: false,
  instrument: { ...requirement.extra.instrumentId },
  revision: "7",
  resourceBindingVersion: "sotto-resource-v1",
  resourceHash:
    "sha256:f8fe5b158e6d56ef4b320ace4f94600f36c6401e69604469ebc20e45f42605bc",
  recipient: requirement.payTo,
  perCallLimitAtomic: "3000000000",
  remainingAllowanceAtomic: "10000000000",
  maximumTotalDebitAtomic: "3250000000",
  expiresAt: "2026-07-13T11:00:00.000Z",
  transferFactoryContractId: "00tokenfactory7",
} as const;
const tokenFactory = {
  interfaceId:
    "55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",
  contractId: "00tokenfactory7",
  implementationTemplateId:
    "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules",
  expectedAdmin: requirement.extra.instrumentId.admin,
} as const;

describe("commitBoundedPurchase", () => {
  it("produces the pinned sotto-purchase-v2 byte contract", () => {
    const result = commitBoundedPurchase({
      authorizationInstanceId: "authorization-7",
      binding,
      capability: captureCapability(capability),
      expectedNetwork: "canton:devnet",
      paymentObservation,
      payerParty: "sotto-payer::1220payer",
      tokenFactory,
    });
    const expectedCanonical = [
      '{"version":"sotto-purchase-v2","authorizationMode":"bounded-capability",',
      '"request":{"bindingVersion":"sotto-http-request-v1",',
      '"requestCommitment":"sha256:a2b8ec2dfeaf0f30def34a1b50de142496078626a93669e129236d2639c136b1",',
      '"bodyHash":"sha256:f5e6a33ee33f216decc18675ab9207a1ff30c128005183dfce8d0c87ca45de3e"},',
      '"challenge":{"x402Version":2,',
      '"challengeId":"sha256:8fdfd64077075dba79cc71e6dd13151e77f8d33f6e22df21fa892abd7941695b",',
      '"observedAt":"2026-07-13T10:00:00.000Z","expiresAt":"2026-07-13T10:00:45.000Z",',
      '"network":"canton:devnet","scheme":"exact","transferMethod":"transfer-factory",',
      '"payer":"sotto-payer::1220payer","recipient":"sotto-provider::1220provider",',
      '"amountAtomic":"2500000000","asset":"CC","feePayer":"sotto-payer::1220payer",',
      '"instrument":{"admin":"DSO::1220dso","id":"Amulet"},',
      '"synchronizerId":"global-domain::1220sync"},',
      '"capability":{"agentParty":"sotto-agent::1220agent",',
      '"contractId":"00capability7",',
      `"templateId":"${CAPABILITY_TEMPLATE_ID}",`,
      '"revision":"7",',
      '"resourceBindingVersion":"sotto-resource-v1",',
      '"resourceHash":"sha256:f8fe5b158e6d56ef4b320ace4f94600f36c6401e69604469ebc20e45f42605bc",',
      '"recipient":"sotto-provider::1220provider","perCallLimitAtomic":"3000000000",',
      '"remainingAllowanceAtomic":"10000000000","maximumTotalDebitAtomic":"3250000000",',
      '"expiresAt":"2026-07-13T11:00:00.000Z"},',
      '"tokenFactory":{"interfaceId":"55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",',
      '"contractId":"00tokenfactory7",',
      '"implementationTemplateId":"23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules",',
      '"expectedAdmin":"DSO::1220dso"},"authorizationInstanceId":"authorization-7",',
      '"attemptId":"sha256:301d1843f5735833f701f85792d4db7c636f7a29c71841ad692e2043b85e3629"}',
    ].join("");

    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(
      expectedCanonical,
    );
    expect(result).toMatchObject({
      attemptId:
        "sha256:301d1843f5735833f701f85792d4db7c636f7a29c71841ad692e2043b85e3629",
      challengeId:
        "sha256:8fdfd64077075dba79cc71e6dd13151e77f8d33f6e22df21fa892abd7941695b",
      commitment:
        "sha256:0d1fe887f46b714a16c11bd082a5cc5743f36d4f28ed98a91086528bd44cf9c8",
      expiresAt: "2026-07-13T10:00:45.000Z",
      version: "sotto-purchase-v2",
    });

    const reordered = commitBoundedPurchase({
      tokenFactory: {
        expectedAdmin: tokenFactory.expectedAdmin,
        implementationTemplateId: tokenFactory.implementationTemplateId,
        contractId: tokenFactory.contractId,
        interfaceId: tokenFactory.interfaceId,
      },
      payerParty: "sotto-payer::1220payer",
      expectedNetwork: "canton:devnet",
      paymentObservation,
      capability: captureCapability({
        agentParty: capability.agentParty,
        expiresAt: capability.expiresAt,
        expectedAdmin: capability.expectedAdmin,
        instrument: capability.instrument,
        maximumTotalDebitAtomic: capability.maximumTotalDebitAtomic,
        paused: capability.paused,
        payerParty: capability.payerParty,
        remainingAllowanceAtomic: capability.remainingAllowanceAtomic,
        perCallLimitAtomic: capability.perCallLimitAtomic,
        recipient: capability.recipient,
        resourceHash: capability.resourceHash,
        resourceBindingVersion: capability.resourceBindingVersion,
        revision: capability.revision,
        contractId: capability.contractId,
        templateId: capability.templateId,
        transferFactoryContractId: capability.transferFactoryContractId,
      }),
      binding,
      authorizationInstanceId: "authorization-7",
    });
    expect(reordered.canonicalBytes).toEqual(result.canonicalBytes);
    expect(reordered.commitment).toBe(result.commitment);
  });
});
