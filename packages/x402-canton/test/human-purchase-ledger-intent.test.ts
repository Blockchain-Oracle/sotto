import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitHumanPurchaseForTest,
  HUMAN_PURCHASE_COMMITMENT_VERSION,
} from "../src/human-purchase-commitment.js";
import { readHumanPaymentAuthority } from "../src/human-payment-observation.js";
import { readHumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
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
  humanWalletIdentity,
} from "./human-purchase-commitment.fixtures.js";
import { HUMAN_PAYER } from "./human-payer-identity.fixtures.js";
import { PROVIDER } from "./purchase-commitment.fixtures.js";

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe("policy-free human Ledger intent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("projects the complete payer-only direct transfer intent", async () => {
    const input = await createHumanPurchaseInput();
    const commitment = commitHumanPurchaseForTest(
      input,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      HUMAN_AUTHORIZATION_INSTANCE_ID,
    );
    const binding = readHumanPaymentAuthority(input.paymentObservation).binding;
    const identity = humanWalletIdentity(input.walletPreflight);
    const selection = input.packageSelection;
    const intent = readHumanPurchaseLedgerIntent(commitment);

    expect(intent).toEqual({
      version: HUMAN_PURCHASE_COMMITMENT_VERSION,
      authorizationMode: "human-wallet",
      actAs: [HUMAN_PAYER],
      attemptId: commitment.attemptId,
      purchaseCommitment: commitment.commitment,
      request: {
        bindingVersion: binding.version,
        method: "GET",
        queryPresent: true,
        resourceOrigin: "https://provider.example",
        resourcePath: "/paid/weather",
        requestCommitment: binding.commitment,
        bodyHash: `sha256:${binding.bodySha256}`,
      },
      challenge: {
        x402Version: 2,
        challengeId: commitment.challengeId,
        requestedAt: HUMAN_PURCHASE_NOW,
        executeBefore: HUMAN_PURCHASE_EXPIRES_AT,
        network: identity.network,
        scheme: "exact",
        transferMethod: "transfer-factory",
        payerParty: HUMAN_PAYER,
        recipientParty: PROVIDER,
        amountAtomic: HUMAN_PURCHASE_AMOUNT_ATOMIC,
        asset: "CC",
        feePayerParty: HUMAN_PAYER,
        instrument: {
          admin: HUMAN_TOKEN_FACTORY_CONFIGURATION.expectedAdmin,
          id: "Amulet",
        },
        synchronizerId: identity.synchronizerId,
      },
      payerIdentity: identity,
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
    });
    expectDeepFrozen(intent);
    expect(intent.payerIdentity).not.toBe(identity);
    expect(intent.packageSelection).not.toBe(input.packageSelection);
    expect(JSON.stringify(intent)).not.toMatch(
      /capability|policy|allowance|agentParty|authorizationInstanceId/iu,
    );
  });
});
