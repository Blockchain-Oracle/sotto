import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitHumanPurchaseForTest,
  HUMAN_PURCHASE_ATTEMPT_VERSION,
  HUMAN_PURCHASE_COMMITMENT_VERSION,
} from "../src/human-purchase-commitment.js";
import { readHumanPaymentAuthority } from "../src/human-payment-observation.js";
import {
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "../src/purchase-commitment-validation.js";
import {
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_PURCHASE_AMOUNT_ATOMIC,
  HUMAN_PURCHASE_EXPIRES_AT,
  HUMAN_PURCHASE_MAXIMUM_DEBIT_ATOMIC,
  HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";

function hash(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

describe("policy-free human purchase commitment", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("freezes one exact human-wallet purchase without policy authority", async () => {
    const input = await createHumanPurchaseInput();
    const result = commitHumanPurchaseForTest(
      input,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      HUMAN_AUTHORIZATION_INSTANCE_ID,
    );
    const binding = readHumanPaymentAuthority(input.paymentObservation).binding;
    const identity = input.payerIdentity;
    const selection = input.packageSelection;
    const purchase = {
      version: HUMAN_PURCHASE_COMMITMENT_VERSION,
      authorizationMode: "human-wallet",
      request: {
        bindingVersion: binding.version,
        requestCommitment: binding.commitment,
        bodyHash: `sha256:${binding.bodySha256}`,
      },
      challenge: {
        x402Version: 2,
        challengeId: input.paymentObservation.challengeId,
        observedAt: HUMAN_PURCHASE_NOW,
        expiresAt: HUMAN_PURCHASE_EXPIRES_AT,
        network: identity.network,
        scheme: "exact",
        transferMethod: "transfer-factory",
        payer: identity.party,
        recipient: selection.parties.find(
          (party) =>
            party !== identity.party &&
            party !== HUMAN_TOKEN_FACTORY_CONFIGURATION.expectedAdmin,
        ),
        amountAtomic: HUMAN_PURCHASE_AMOUNT_ATOMIC,
        asset: "CC",
        feePayer: identity.party,
        instrument: {
          admin: HUMAN_TOKEN_FACTORY_CONFIGURATION.expectedAdmin,
          id: "Amulet",
        },
        synchronizerId: identity.synchronizerId,
      },
      payerIdentity: {
        version: identity.version,
        party: identity.party,
        network: identity.network,
        synchronizerId: identity.synchronizerId,
        publicKeyFingerprint: identity.publicKeyFingerprint,
        signingAlgorithm: identity.signingAlgorithm,
        signatureFormat: identity.signatureFormat,
        publicKeyFormat: identity.publicKeyFormat,
        keyPurpose: identity.keyPurpose,
        topologyHash: identity.topologyHash,
        acquiredAt: identity.acquiredAt,
        subjectHash: identity.subjectHash,
      },
      limits: {
        maximumFeeAtomic: HUMAN_PURCHASE_MAXIMUM_FEE_ATOMIC,
        maximumTotalDebitAtomic: HUMAN_PURCHASE_MAXIMUM_DEBIT_ATOMIC,
      },
      tokenFactory: {
        interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
        contractId: HUMAN_TOKEN_FACTORY_CONFIGURATION.contractId,
        creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
        expectedAdmin: HUMAN_TOKEN_FACTORY_CONFIGURATION.expectedAdmin,
      },
      packageSelection: {
        version: selection.version,
        closureHash: selection.closureHash,
        references: selection.references.map((reference) => ({
          packageId: reference.packageId,
          packageName: reference.packageName,
          packageVersion: reference.packageVersion,
          artifactIds: reference.artifactIds,
        })),
        packageIds: selection.packageIds,
        parties: selection.parties,
        synchronizerId: selection.synchronizerId,
        vettingValidAt: selection.vettingValidAt,
        acquiredAt: selection.acquiredAt,
        subjectHash: selection.subjectHash,
      },
      authorizationInstanceId: HUMAN_AUTHORIZATION_INSTANCE_ID,
    } as const;
    const attemptId = hash(
      JSON.stringify({
        version: HUMAN_PURCHASE_ATTEMPT_VERSION,
        purchase,
      }),
    );
    const expectedCanonical = JSON.stringify({ ...purchase, attemptId });

    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(
      expectedCanonical,
    );
    expect(result).toMatchObject({
      attemptId:
        "sha256:14bf833e9e2cee1e46f00956a4033a13486371e977157e98bbbfdc653184f94b",
      challengeId:
        "sha256:833eb1a52dbf7bf94dec7cfa52d5bc573d8d3a597fb6eef6eeeffe8f196b8005",
      commitment:
        "sha256:7b37f4ca0d05ae68ce422658aa7b7c2db8e34ffa0b93512db7e62028c2916b5b",
      expiresAt: HUMAN_PURCHASE_EXPIRES_AT,
      requestCommitment: binding.commitment,
      version: HUMAN_PURCHASE_COMMITMENT_VERSION,
    });
    expect(result.attemptId).toBe(attemptId);
    expect(result.commitment).toBe(hash(expectedCanonical));
    expect(result.canonicalBytes).toHaveLength(3_213);
    expect(expectedCanonical).not.toMatch(
      /capability|allowance|agentParty|policy|revision/iu,
    );
  });
});
