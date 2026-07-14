import { describe, expect, it } from "vitest";
import * as purchaseCommitment from "../src/purchase-commitment.js";
import {
  createPurchaseV3Input,
  withPurchaseV3Clock,
} from "./purchase-package-selection.fixtures.js";

const ATTEMPT_ID =
  "sha256:a5045ca2c04fa0249b87a7011e52a7b2b82f1b87f6e2f2e5125bd863f7866283";
const COMMITMENT =
  "sha256:e85893f89a62367dd70e381de5635c3be28f1549b143b4458fe4968c05c86611";

const EXPECTED_CANONICAL = [
  '{"version":"sotto-purchase-v3","authorizationMode":"bounded-capability",',
  '"request":{"bindingVersion":"sotto-http-request-v1",',
  '"requestCommitment":"sha256:f0952779d373bc9b1666e71390e9cfa2752541f92575c8bdd956c0d87f22bac1",',
  '"bodyHash":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},',
  '"challenge":{"x402Version":2,',
  '"challengeId":"sha256:a0ed1ac61f4591af5b45ef4a7f10e2508d64b677a7e69e455dcd1a5f4420db17",',
  '"observedAt":"2026-07-13T10:00:00.000Z","expiresAt":"2026-07-13T10:00:45.000Z",',
  '"network":"canton:devnet","scheme":"exact","transferMethod":"transfer-factory",',
  '"payer":"sotto-payer::1220payer","recipient":"sotto-provider::1220provider",',
  '"amountAtomic":"2500000000","asset":"CC","feePayer":"sotto-payer::1220payer",',
  '"instrument":{"admin":"DSO::1220dso","id":"Amulet"},',
  '"synchronizerId":"global-domain::1220sync"},',
  '"capability":{"agentParty":"sotto-agent::1220agent",',
  '"contractId":"00capability7",',
  '"templateId":"4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57:Sotto.Control.PurchaseCapability:BoundedPurchaseCapability",',
  '"revision":"7","resourceBindingVersion":"sotto-resource-v1",',
  '"resourceHash":"sha256:f8fe5b158e6d56ef4b320ace4f94600f36c6401e69604469ebc20e45f42605bc",',
  '"recipient":"sotto-provider::1220provider","perCallLimitAtomic":"3000000000",',
  '"remainingAllowanceAtomic":"10000000000","maximumTotalDebitAtomic":"3250000000",',
  '"expiresAt":"2026-07-13T11:00:00.000Z"},',
  '"tokenFactory":{"interfaceId":"55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281:Splice.Api.Token.TransferInstructionV1:TransferFactory",',
  '"contractId":"00tokenfactory7",',
  '"creationTemplateId":"a5b055492fb8f08b2e7bc0fc94da6da50c39c2e1d7f24cd5ea8db12fc87c1332:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules",',
  '"expectedAdmin":"DSO::1220dso"},',
  '"packageSelection":{"version":"sotto-package-selection-v1",',
  '"observationId":"sha256:8888888888888888888888888888888888888888888888888888888888888888",',
  '"closureHash":"sha256:4a1bcf39aac8d5232b1e6e4caee93a39a3022a2ff235e13574e5d91c61cd299d",',
  '"requirements":[{"packageName":"sotto-control",',
  '"parties":["DSO::1220dso","sotto-agent::1220agent","sotto-payer::1220payer","sotto-provider::1220provider"]},',
  '{"packageName":"splice-amulet",',
  '"parties":["DSO::1220dso","sotto-agent::1220agent","sotto-payer::1220payer","sotto-provider::1220provider"]}],',
  '"references":[{"packageId":"4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",',
  '"packageName":"sotto-control","packageVersion":"0.2.0",',
  '"artifactIds":["sotto-control-0.2.0"]},',
  '{"packageId":"73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f",',
  '"packageName":"splice-amulet","packageVersion":"0.1.21",',
  '"artifactIds":["splice-amulet-0.1.21"]}],',
  '"packageIds":["4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",',
  '"73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f"],',
  '"parties":["DSO::1220dso","sotto-agent::1220agent","sotto-payer::1220payer","sotto-provider::1220provider"],',
  '"synchronizerId":"global-domain::1220sync",',
  '"vettingValidAt":"2026-07-13T10:00:30.000Z",',
  '"acquiredAt":"2026-07-13T10:00:00.000Z",',
  '"authenticatedSubject":"validator-devnet-m2m"},',
  '"authorizationInstanceId":"authorization-7",',
  '"attemptId":"sha256:a5045ca2c04fa0249b87a7011e52a7b2b82f1b87f6e2f2e5125bd863f7866283"}',
].join("");

export function registerPurchaseV3VectorCases(): void {
  describe("sotto-purchase-v3 canonical migration", () => {
    it("pins complete package authority under explicit v3 discriminators", async () => {
      const versions = purchaseCommitment as unknown as {
        PURCHASE_COMMITMENT_VERSION: string;
        PURCHASE_ATTEMPT_VERSION?: string;
      };
      if (
        versions.PURCHASE_COMMITMENT_VERSION !== "sotto-purchase-v3" ||
        versions.PURCHASE_ATTEMPT_VERSION !== "sotto-purchase-attempt-v3"
      ) {
        throw new Error("PURCHASE_V3_NOT_IMPLEMENTED");
      }

      await withPurchaseV3Clock(() => {
        const result = purchaseCommitment.commitBoundedPurchase(
          createPurchaseV3Input() as never,
        );
        expect(new TextDecoder().decode(result.canonicalBytes)).toBe(
          EXPECTED_CANONICAL,
        );
        expect(result).toMatchObject({
          attemptId: ATTEMPT_ID,
          commitment: COMMITMENT,
          challengeId:
            "sha256:a0ed1ac61f4591af5b45ef4a7f10e2508d64b677a7e69e455dcd1a5f4420db17",
          expiresAt: "2026-07-13T10:00:45.000Z",
          version: "sotto-purchase-v3",
        });
      });
    });
  });
}
