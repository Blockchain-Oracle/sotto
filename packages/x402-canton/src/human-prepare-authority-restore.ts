import {
  registerRestoredHumanPurchaseCommandAuthority,
  type HumanPurchaseCommandAuthority,
} from "./human-purchase-authority.js";
import { validateHumanPurchaseConfiguration } from "./human-purchase-configuration.js";
import { registerRestoredHumanPurchaseCommitment } from "./human-purchase-commitment.js";
import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";
import { readHumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { projectRestoredHumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent-validation.js";
import {
  restoredHumanPurchaseCommitment,
  validateRestoredHumanPurchaseMaterial,
} from "./human-prepare-authority-material.js";
import { exactPrepareObject } from "./human-prepare-authority-primitives.js";
import { prepareHumanPrepareAuthorityPlaintextClaim } from "./human-prepare-authority-state.js";
import { requireFreshHumanPrepareAuthorities } from "./human-prepare-authority-stable.js";
import type {
  AuthenticatedHumanPrepareAuthorityPlaintext,
  HumanPrepareAuthorityPayload,
  HumanPrepareAuthorityRestoreInput,
} from "./human-prepare-authority-types.js";
import { readHumanWalletConnectorPreflightAuthority } from "./human-wallet-connector-preflight-state.js";

function exactJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requestDisplay(payload: HumanPrepareAuthorityPayload) {
  const value = exactPrepareObject(
    payload.requestDisplay,
    ["method", "queryPresent", "resourceOrigin", "resourcePath"],
    "human prepare request display",
  );
  if (
    typeof value.method !== "string" ||
    typeof value.queryPresent !== "boolean" ||
    typeof value.resourceOrigin !== "string" ||
    typeof value.resourcePath !== "string"
  ) {
    throw new Error("human prepare request display is invalid");
  }
  return Object.freeze({
    method: value.method,
    queryPresent: value.queryPresent,
    resourceOrigin: value.resourceOrigin,
    resourcePath: value.resourcePath,
  });
}

function restorationAuthority(
  payload: HumanPrepareAuthorityPayload,
  input: HumanPrepareAuthorityRestoreInput,
  config: HumanPrepareAuthorityPayload["trustedConfiguration"],
): HumanPurchaseCommandAuthority {
  return {
    packageSelection: payload.packageSelection,
    packageSelectionAuthority: input.packageSelection,
    payerIdentity: payload.payerIdentity,
    persistence: Object.freeze({
      challengeBytes: Buffer.from(payload.paymentChallengeBytes, "base64"),
      connector: payload.connector,
      requestBindingCanonicalBytes: Buffer.from(
        payload.requestBindingCanonicalBytes,
        "base64",
      ),
      trustedConfiguration: config,
    }),
    requestDisplay: requestDisplay(payload),
    walletPreflightAuthority: input.walletPreflight,
    commandClaimed: false,
  };
}

export function restoreHumanPrepareAuthority(
  plaintext: AuthenticatedHumanPrepareAuthorityPlaintext,
  input: HumanPrepareAuthorityRestoreInput,
) {
  const claim = prepareHumanPrepareAuthorityPlaintextClaim(plaintext);
  const payload = claim.payload;
  const config = validateHumanPurchaseConfiguration(input.trustedConfiguration);
  if (!exactJson(config, payload.trustedConfiguration)) {
    throw new Error("fresh human trusted configuration does not match");
  }
  const wallet = readHumanWalletConnectorPreflightAuthority(
    input.walletPreflight,
  );
  if (
    !exactJson(wallet.capabilities, payload.connector.capabilities) ||
    wallet.expectedPackageId !== payload.connector.expectedPackageId
  ) {
    throw new Error("fresh human wallet connector does not match");
  }
  const commitment = restoredHumanPurchaseCommitment(payload);
  const now = Date.now();
  if (Date.parse(commitment.expiresAt) - now < MIN_HUMAN_SIGNING_RESERVE_MS) {
    throw new Error("human prepare authority lacks the signing reserve");
  }
  const authority = restorationAuthority(payload, input, config);
  const provisionalIntent = projectRestoredHumanPurchaseLedgerIntent(
    commitment,
    authority,
  );
  requireFreshHumanPrepareAuthorities(
    provisionalIntent,
    input.walletPreflight,
    input.packageSelection,
    now,
  );
  validateRestoredHumanPurchaseMaterial(payload, provisionalIntent);
  registerRestoredHumanPurchaseCommandAuthority({
    commitment,
    packageSelection: authority.packageSelection,
    packageSelectionAuthority: authority.packageSelectionAuthority,
    payerIdentity: authority.payerIdentity,
    persistence: authority.persistence,
    requestDisplay: authority.requestDisplay,
    walletPreflightAuthority: authority.walletPreflightAuthority,
  });
  registerRestoredHumanPurchaseCommitment(commitment);
  const intent = readHumanPurchaseLedgerIntent(commitment);
  claim.commit();
  return intent;
}
