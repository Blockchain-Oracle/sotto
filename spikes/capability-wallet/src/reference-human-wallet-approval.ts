import type { HumanPreparedPurchaseApproval } from "@sotto/x402-canton";
import {
  referenceHumanWalletAtomic,
  referenceHumanWalletHash,
  referenceHumanWalletIdentifier,
  referenceHumanWalletRecord,
  referenceHumanWalletTime,
} from "./reference-human-wallet-data.js";
import { parseReferenceHumanWalletApprovalComponents } from "./reference-human-wallet-approval-components.js";

const APPROVAL_FIELDS = [
  "action",
  "amountAtomic",
  "asset",
  "attemptId",
  "authorizationMode",
  "bodyHash",
  "challengeId",
  "executeBefore",
  "instrument",
  "maximumFeeAtomic",
  "maximumTotalDebitAtomic",
  "method",
  "network",
  "payerParty",
  "preparedTransactionHash",
  "providerParty",
  "purchaseCommitment",
  "queryPresent",
  "requestCommitment",
  "resourceOrigin",
  "resourcePath",
  "selectedPackage",
  "signer",
  "synchronizerId",
  "tokenFactory",
  "transferContextHash",
  "version",
] as const;

function fixed(value: unknown, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`reference human wallet request ${label} is invalid`);
  }
}

function canonicalResourcePath(value: unknown, origin: string): string {
  const path = referenceHumanWalletIdentifier(value, "approval path", 8_192);
  let resource: URL;
  try {
    resource = new URL(path, origin);
  } catch {
    throw new Error("reference human wallet request approval path is invalid");
  }
  if (
    !path.startsWith("/") ||
    resource.origin !== origin ||
    resource.pathname !== path ||
    resource.search !== "" ||
    resource.hash !== ""
  ) {
    throw new Error("reference human wallet request approval path is invalid");
  }
  return path;
}

export function parseReferenceHumanWalletApproval(
  value: unknown,
  preparedTransactionHash: `sha256:${string}`,
): HumanPreparedPurchaseApproval {
  const approval = referenceHumanWalletRecord(
    value,
    APPROVAL_FIELDS,
    "approval",
  );
  fixed(
    approval.version,
    "sotto-human-purchase-approval-v2",
    "approval version",
  );
  fixed(approval.action, "pay-for-api-call", "approval action");
  fixed(approval.authorizationMode, "human-wallet", "approval mode");
  fixed(approval.asset, "CC", "approval asset");
  if (
    approval.preparedTransactionHash !== preparedTransactionHash ||
    typeof approval.queryPresent !== "boolean"
  ) {
    throw new Error(
      "reference human wallet request approval binding is invalid",
    );
  }
  const method = referenceHumanWalletIdentifier(
    approval.method,
    "approval method",
    32,
  );
  if (!/^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]{0,31}$/u.test(method)) {
    throw new Error(
      "reference human wallet request approval method is invalid",
    );
  }
  const resourceOrigin = referenceHumanWalletIdentifier(
    approval.resourceOrigin,
    "approval origin",
    8_192,
  );
  let origin: URL;
  try {
    origin = new URL(resourceOrigin);
  } catch {
    throw new Error(
      "reference human wallet request approval origin is invalid",
    );
  }
  if (
    origin.protocol !== "https:" ||
    origin.origin !== resourceOrigin ||
    origin.username !== "" ||
    origin.password !== ""
  ) {
    throw new Error(
      "reference human wallet request approval origin is invalid",
    );
  }
  const components = parseReferenceHumanWalletApprovalComponents(approval);
  const network = referenceHumanWalletIdentifier(
    approval.network,
    "approval network",
    256,
  );
  if (!network.startsWith("canton:") || network === "canton:") {
    throw new Error(
      "reference human wallet request approval network is invalid",
    );
  }
  const hash = (field: keyof typeof approval, label: string) =>
    referenceHumanWalletHash(approval[field], label);
  return Object.freeze({
    version: "sotto-human-purchase-approval-v2",
    action: "pay-for-api-call",
    authorizationMode: "human-wallet",
    method,
    resourceOrigin,
    resourcePath: canonicalResourcePath(approval.resourcePath, resourceOrigin),
    queryPresent: approval.queryPresent,
    payerParty: referenceHumanWalletIdentifier(
      approval.payerParty,
      "approval payer",
    ),
    providerParty: referenceHumanWalletIdentifier(
      approval.providerParty,
      "approval provider",
    ),
    amountAtomic: referenceHumanWalletAtomic(
      approval.amountAtomic,
      "approval amount",
    ),
    asset: "CC",
    maximumFeeAtomic: referenceHumanWalletAtomic(
      approval.maximumFeeAtomic,
      "approval fee",
    ),
    maximumTotalDebitAtomic: referenceHumanWalletAtomic(
      approval.maximumTotalDebitAtomic,
      "approval debit",
    ),
    instrument: components.instrument,
    network: network as `canton:${string}`,
    synchronizerId: referenceHumanWalletIdentifier(
      approval.synchronizerId,
      "approval synchronizer",
    ),
    executeBefore: referenceHumanWalletTime(
      approval.executeBefore,
      "approval expiry",
    ),
    attemptId: hash("attemptId", "approval attempt"),
    challengeId: hash("challengeId", "approval challenge"),
    requestCommitment: hash("requestCommitment", "approval request"),
    purchaseCommitment: hash("purchaseCommitment", "approval purchase"),
    bodyHash: hash("bodyHash", "approval body"),
    transferContextHash: hash(
      "transferContextHash",
      "approval transfer context",
    ),
    preparedTransactionHash,
    selectedPackage: components.selectedPackage,
    tokenFactory: components.tokenFactory,
    signer: components.signer,
  });
}
