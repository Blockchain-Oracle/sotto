import { expect, it } from "vitest";
import { parseLiveWalletCapabilityBootstrapArguments } from "../src/live-wallet-capability-bootstrap.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;

it("accepts only the complete explicit live approval flags", () => {
  const arguments_ = [
    "--expires-at",
    "2026-07-16T06:25:52.383Z",
    "--expected-fingerprint",
    FINGERPRINT,
    "--instrument-admin",
    `DSO::${FINGERPRINT}`,
    "--key-file",
    "/wallet/payer.key",
    "--payer-party",
    `sotto-external-payer::${FINGERPRINT}`,
    "--policy-file",
    "/wallet/policy.json",
    "--resource-hash",
    `sha256:${"b".repeat(64)}`,
    "--synchronizer-id",
    `global-domain::${FINGERPRINT}`,
    "--transfer-factory-contract-id",
    `00${"c".repeat(64)}`,
  ];

  expect(parseLiveWalletCapabilityBootstrapArguments(arguments_)).toEqual({
    expectedFingerprint: FINGERPRINT,
    expiresAt: "2026-07-16T06:25:52.383Z",
    instrumentAdmin: `DSO::${FINGERPRINT}`,
    keyFile: "/wallet/payer.key",
    payerParty: `sotto-external-payer::${FINGERPRINT}`,
    policyFile: "/wallet/policy.json",
    resourceHash: `sha256:${"b".repeat(64)}`,
    synchronizerId: `global-domain::${FINGERPRINT}`,
    transferFactoryContractId: `00${"c".repeat(64)}`,
  });
  expect(() =>
    parseLiveWalletCapabilityBootstrapArguments(arguments_.slice(0, -2)),
  ).toThrow(/required/iu);
  expect(() =>
    parseLiveWalletCapabilityBootstrapArguments([...arguments_, "--extra"]),
  ).toThrow(/arguments/iu);
});
