import { expect, it } from "vitest";
import { projectLiveFiveNorthHumanPrepareOutput } from "../src/live-five-north-human-prepare-output.js";

it("emits only the reviewed read-only preparation evidence", () => {
  const output = projectLiveFiveNorthHumanPrepareOutput("a".repeat(40), {
    approval: {
      action: "pay-for-api-call",
      amountAtomic: "2500000000",
      asset: "CC",
      attemptId: `sha256:${"1".repeat(64)}`,
      authorizationMode: "human-wallet",
      bodyHash: `sha256:${"2".repeat(64)}`,
      challengeId: `sha256:${"3".repeat(64)}`,
      executeBefore: "2026-07-17T06:10:00.000Z",
      instrument: { admin: "DSO::trusted", id: "Amulet" },
      maximumFeeAtomic: "750000000",
      maximumTotalDebitAtomic: "3250000000",
      method: "GET",
      network: "canton:devnet",
      payerParty: "sotto-external-payer::trusted",
      preparedTransactionHash: `sha256:${"4".repeat(64)}`,
      providerParty: "sotto-provider::trusted",
      purchaseCommitment: `sha256:${"5".repeat(64)}`,
      queryPresent: false,
      requestCommitment: `sha256:${"6".repeat(64)}`,
      resourceOrigin: "https://private-origin.trycloudflare.com",
      resourcePath: "/paid/weather",
      selectedPackage: {
        packageId: "7".repeat(64),
        packageName: "splice-amulet",
        packageVersion: "0.1.21",
        privateArtifact: "must-not-leak",
      },
      signer: {
        publicKeyFingerprint: `1220${"8".repeat(64)}`,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      },
      synchronizerId: "global-domain::trusted",
      tokenFactory: {
        contractId: "00factory",
        expectedAdmin: "DSO::trusted",
        privateDisclosure: "must-not-leak",
      },
      version: "sotto-human-purchase-approval-v1",
      privatePreparedTransaction: "must-not-leak",
    },
    status: "prepared-hash-verified-not-signed",
    verified: { preparedTransaction: "must-not-leak" },
  } as never);

  expect(output).toMatchObject({
    schema: "sotto-five-north-human-prepare-only-v1",
    sourceCommit: "a".repeat(40),
    status: "prepared-hash-verified-not-signed",
    approval: {
      action: "pay-for-api-call",
      amountAtomic: "2500000000",
      resourcePath: "/paid/weather",
    },
  });
  const serialized = JSON.stringify(output);
  expect(serialized).not.toContain("private-origin");
  expect(serialized).not.toContain("must-not-leak");
  expect(serialized).not.toContain('preparedTransaction"');
  expect(output).not.toHaveProperty("verified");
});
