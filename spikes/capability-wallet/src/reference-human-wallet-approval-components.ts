import type { HumanPreparedPurchaseApproval } from "@sotto/x402-canton";
import {
  referenceHumanWalletIdentifier,
  referenceHumanWalletRecord,
} from "./reference-human-wallet-data.js";

type ApprovalComponents = Pick<
  HumanPreparedPurchaseApproval,
  "instrument" | "selectedPackage" | "signer" | "tokenFactory"
>;

function fixed(value: unknown, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
}

export function parseReferenceHumanWalletApprovalComponents(
  approval: Readonly<Record<string, unknown>>,
): ApprovalComponents {
  const instrument = referenceHumanWalletRecord(
    approval.instrument,
    ["admin", "id"],
    "approval instrument",
  );
  fixed(instrument.id, "Amulet", "approval instrument ID");
  const selectedPackage = referenceHumanWalletRecord(
    approval.selectedPackage,
    ["packageId", "packageName", "packageVersion"],
    "approval package",
  );
  const packageId = referenceHumanWalletIdentifier(
    selectedPackage.packageId,
    "approval package ID",
    64,
  );
  if (!/^[0-9a-f]{64}$/u.test(packageId)) {
    throw new Error(
      "reference human wallet request approval package is invalid",
    );
  }
  fixed(selectedPackage.packageName, "splice-amulet", "approval package name");
  const tokenFactory = referenceHumanWalletRecord(
    approval.tokenFactory,
    ["contractId", "expectedAdmin"],
    "approval factory",
  );
  const signer = referenceHumanWalletRecord(
    approval.signer,
    [
      "publicKeyFingerprint",
      "publicKeyFormat",
      "signatureFormat",
      "signingAlgorithm",
    ],
    "approval signer",
  );
  const fingerprint = referenceHumanWalletIdentifier(
    signer.publicKeyFingerprint,
    "approval fingerprint",
    68,
  );
  if (!/^1220[0-9a-f]{64}$/u.test(fingerprint)) {
    throw new Error(
      "reference human wallet request approval signer is invalid",
    );
  }
  return Object.freeze({
    instrument: Object.freeze({
      admin: referenceHumanWalletIdentifier(
        instrument.admin,
        "approval instrument admin",
      ),
      id: "Amulet",
    }),
    selectedPackage: Object.freeze({
      packageId,
      packageName: "splice-amulet",
      packageVersion: referenceHumanWalletIdentifier(
        selectedPackage.packageVersion,
        "approval package version",
        128,
      ),
    }),
    tokenFactory: Object.freeze({
      contractId: referenceHumanWalletIdentifier(
        tokenFactory.contractId,
        "approval factory ID",
      ),
      expectedAdmin: referenceHumanWalletIdentifier(
        tokenFactory.expectedAdmin,
        "approval factory admin",
      ),
    }),
    signer: Object.freeze({
      publicKeyFingerprint: fingerprint as `1220${string}`,
      publicKeyFormat: referenceHumanWalletIdentifier(
        signer.publicKeyFormat,
        "approval key format",
      ) as HumanPreparedPurchaseApproval["signer"]["publicKeyFormat"],
      signatureFormat: referenceHumanWalletIdentifier(
        signer.signatureFormat,
        "approval signature format",
      ) as HumanPreparedPurchaseApproval["signer"]["signatureFormat"],
      signingAlgorithm: referenceHumanWalletIdentifier(
        signer.signingAlgorithm,
        "approval signing algorithm",
      ) as HumanPreparedPurchaseApproval["signer"]["signingAlgorithm"],
    }),
  });
}
