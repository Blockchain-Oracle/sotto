import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  readBoundedPurchaseLedgerIntent,
  type BoundedPurchaseCommitmentInput,
} from "../src/index.js";
import {
  createPurchaseInput,
  mutateChallenge,
  readChallengeBytes,
  replaceBoundRequest,
  replaceCapability,
  replaceChallengeObservation,
  routeHash,
} from "./purchase-commitment.fixtures.js";

function read(input: BoundedPurchaseCommitmentInput) {
  return readBoundedPurchaseLedgerIntent(commitBoundedPurchase(input));
}

describe("bounded purchase Ledger intent projection", () => {
  it("projects changed request, challenge, and timing fields", () => {
    let input = replaceBoundRequest(createPurchaseInput(), {
      body: new TextEncoder().encode("alternate-body"),
      headers: [["content-type", "text/plain"]],
      method: "POST",
      url: "https://provider.example/paid/forecast?units=imperial",
    });
    input = mutateChallenge(input, (challenge) => {
      challenge.accepts[0]!.amount = "2000000000";
      challenge.accepts[0]!.asset = "TestCoin";
      challenge.accepts[0]!.extra.synchronizerId = "other-domain::1220sync";
    });
    input = replaceChallengeObservation(
      input,
      readChallengeBytes(input),
      "2026-07-13T10:00:05.000Z",
    );

    const intent = read(input);
    expect(intent.request).toEqual({
      bindingVersion: input.binding.version,
      requestCommitment: input.binding.commitment,
      bodyHash: `sha256:${input.binding.bodySha256}`,
    });
    expect(intent.challenge).toMatchObject({
      amountAtomic: "2000000000",
      asset: "TestCoin",
      requestedAt: "2026-07-13T10:00:05.000Z",
      executeBefore: "2026-07-13T10:00:50.000Z",
      synchronizerId: "other-domain::1220sync",
    });
    expect(intent.capability.resourceHash).toBe(
      routeHash("https://provider.example/paid/forecast?units=imperial"),
    );
  });

  it("projects changed payer, agent, recipient, capability, and limits", () => {
    const payer = "sotto-payer-2::1220payer";
    const agent = "sotto-agent-2::1220agent";
    const recipient = "sotto-provider-2::1220provider";
    let input = replaceCapability(createPurchaseInput(), (capability) => ({
      ...capability,
      agentParty: agent,
      contractId: "00capability8",
      expiresAt: "2026-07-13T12:00:00.000Z",
      maximumTotalDebitAtomic: "3000000000",
      payerParty: payer,
      perCallLimitAtomic: "2800000000",
      recipient,
      remainingAllowanceAtomic: "5000000000",
      revision: "8",
    }));
    input = mutateChallenge({ ...input, payerParty: payer }, (challenge) => {
      challenge.accepts[0]!.extra.feePayer = payer;
      challenge.accepts[0]!.payTo = recipient;
    });

    const intent = read(input);
    expect(intent.actAs).toEqual([agent]);
    expect(intent.challenge).toMatchObject({
      payerParty: payer,
      feePayerParty: payer,
      recipientParty: recipient,
    });
    expect(intent.capability).toMatchObject({
      agentParty: agent,
      contractId: "00capability8",
      expectedRevision: "8",
      recipientParty: recipient,
      perCallLimitAtomic: "2800000000",
      remainingAllowanceAtomic: "5000000000",
      maximumTotalDebitAtomic: "3000000000",
      expiresAt: "2026-07-13T12:00:00.000Z",
    });
  });

  it("projects changed instrument and factory identities", () => {
    const admin = "DSO-2::1220dso";
    const contractId = "00tokenfactory8";
    let input = replaceCapability(createPurchaseInput(), (capability) => ({
      ...capability,
      expectedAdmin: admin,
      instrument: { admin, id: "TestAmulet" },
      transferFactoryContractId: contractId,
    }));
    input = mutateChallenge(
      {
        ...input,
        tokenFactory: {
          ...input.tokenFactory,
          contractId,
          expectedAdmin: admin,
        },
      },
      (challenge) => {
        challenge.accepts[0]!.extra.instrumentId = {
          admin,
          id: "TestAmulet",
        };
      },
    );

    const intent = read(input);
    expect(intent.challenge.instrument).toEqual({ admin, id: "TestAmulet" });
    expect(intent.tokenFactory).toMatchObject({
      contractId,
      expectedAdmin: admin,
    });
  });
});
