import { describe, expect, it } from "vitest";
import {
  APPROVED_FIVE_NORTH_SPLICE_WALLET_PACKAGE_ID,
  discoverFiveNorthPreapprovalProposal,
} from "../src/five-north-preapproval-discovery.js";

const receiver = `sotto-spike-provider::1220${"1".repeat(64)}`;
const validator = `five-north-validator::1220${"2".repeat(64)}`;
const dso = `DSO::1220${"3".repeat(64)}`;
const synchronizerId = `global-domain::1220${"4".repeat(64)}`;
const packageId = APPROVED_FIVE_NORTH_SPLICE_WALLET_PACKAGE_ID;

function fixture() {
  return {
    amuletRules: {
      amulet_rules: {
        contract: { payload: { dso } },
        domain_id: synchronizerId,
      },
    },
    authenticatedUserId: "ledger-user-6",
    preferredWalletPackage: {
      packageReferences: [
        { packageId, packageName: "splice-wallet", packageVersion: "0.1.21" },
      ],
      synchronizerId,
    },
    receiverParty: receiver,
    validatorUser: {
      featured: true,
      party_id: validator,
      user_name: "validator",
    },
  } as const;
}

describe("Five North preapproval discovery", () => {
  it("builds one authenticated proposal from exact live prerequisites", () => {
    const request = discoverFiveNorthPreapprovalProposal(fixture());

    expect(request).toMatchObject({
      actAs: [receiver],
      packageIdSelectionPreference: [packageId],
      synchronizerId,
      userId: "ledger-user-6",
      commands: [
        {
          CreateCommand: {
            createArguments: {
              expectedDso: dso,
              provider: validator,
              receiver,
            },
          },
        },
      ],
    });
  });

  it.each([
    [
      "unfeatured validator",
      { validatorUser: { ...fixture().validatorUser, featured: false } },
    ],
    [
      "wrong package",
      {
        preferredWalletPackage: {
          ...fixture().preferredWalletPackage,
          packageReferences: [
            { packageId, packageName: "other", packageVersion: "0.1.21" },
          ],
        },
      },
    ],
    [
      "wrong version",
      {
        preferredWalletPackage: {
          ...fixture().preferredWalletPackage,
          packageReferences: [
            {
              packageId,
              packageName: "splice-wallet",
              packageVersion: "0.2.0",
            },
          ],
        },
      },
    ],
    [
      "repacked package",
      {
        preferredWalletPackage: {
          ...fixture().preferredWalletPackage,
          packageReferences: [
            {
              packageId: "f".repeat(64),
              packageName: "splice-wallet",
              packageVersion: "0.1.21",
            },
          ],
        },
      },
    ],
    [
      "synchronizer mismatch",
      {
        preferredWalletPackage: {
          ...fixture().preferredWalletPackage,
          synchronizerId: `other::1220${"5".repeat(64)}`,
        },
      },
    ],
    [
      "unbounded receiver",
      { receiverParty: `other-provider::1220${"1".repeat(64)}` },
    ],
  ] as const)("rejects %s", (_label, mutation) => {
    expect(() =>
      discoverFiveNorthPreapprovalProposal({ ...fixture(), ...mutation }),
    ).toThrow();
  });
});
