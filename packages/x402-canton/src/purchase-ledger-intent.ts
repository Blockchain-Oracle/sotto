import {
  type BoundedPurchaseCommitment,
  type APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  type FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  type PURCHASE_COMMITMENT_VERSION,
  type TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "./purchase-commitment.js";
import {
  readBoundedPurchasePackageSelectionAuthority,
  type BoundedPurchasePackageSelectionAuthority,
} from "./purchase-package-selection-authority.js";
import type { BoundedPurchasePackageSelection } from "./purchase-ledger-package-selection.js";
import { projectBoundedPurchaseLedgerIntent } from "./purchase-ledger-intent-validation.js";

type Sha256 = `sha256:${string}`;

export type BoundedPurchaseLedgerIntent = Readonly<{
  version: typeof PURCHASE_COMMITMENT_VERSION;
  authorizationMode: "bounded-capability";
  actAs: readonly [string];
  attemptId: Sha256;
  purchaseCommitment: Sha256;
  request: Readonly<{
    bindingVersion: "sotto-http-request-v1";
    requestCommitment: Sha256;
    bodyHash: Sha256;
  }>;
  challenge: Readonly<{
    x402Version: 2;
    challengeId: Sha256;
    requestedAt: string;
    executeBefore: string;
    network: `canton:${string}`;
    scheme: "exact";
    transferMethod: "transfer-factory";
    payerParty: string;
    recipientParty: string;
    amountAtomic: string;
    asset: string;
    feePayerParty: string;
    instrument: Readonly<{ admin: string; id: string }>;
    synchronizerId: string;
  }>;
  capability: Readonly<{
    agentParty: string;
    contractId: string;
    templateId: typeof APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID;
    expectedRevision: string;
    resourceBindingVersion: "sotto-resource-v1";
    resourceHash: Sha256;
    recipientParty: string;
    perCallLimitAtomic: string;
    remainingAllowanceAtomic: string;
    maximumTotalDebitAtomic: string;
    expiresAt: string;
  }>;
  tokenFactory: Readonly<{
    interfaceId: typeof TOKEN_TRANSFER_FACTORY_INTERFACE_ID;
    contractId: string;
    creationTemplateId: typeof FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID;
    expectedAdmin: string;
  }>;
  packageSelection: BoundedPurchasePackageSelection;
}>;

type AuthenticLedgerIntentState = Readonly<{
  intent: BoundedPurchaseLedgerIntent;
  packageSelectionAuthority: BoundedPurchasePackageSelectionAuthority;
}>;

const authenticLedgerIntents = new WeakMap<
  object,
  AuthenticLedgerIntentState
>();

function freezeIntent(
  intent: BoundedPurchaseLedgerIntent,
): BoundedPurchaseLedgerIntent {
  Object.freeze(intent.actAs);
  Object.freeze(intent.request);
  Object.freeze(intent.challenge.instrument);
  Object.freeze(intent.challenge);
  Object.freeze(intent.capability);
  Object.freeze(intent.tokenFactory);
  Object.freeze(intent.packageSelection);
  return Object.freeze(intent);
}

export function readBoundedPurchaseLedgerIntent(
  commitment: BoundedPurchaseCommitment,
): BoundedPurchaseLedgerIntent {
  const packageSelectionAuthority =
    readBoundedPurchasePackageSelectionAuthority(commitment);
  const intent = freezeIntent(projectBoundedPurchaseLedgerIntent(commitment));
  if (
    JSON.stringify(intent.packageSelection) !==
    JSON.stringify(packageSelectionAuthority.canonical)
  ) {
    throw new Error("bounded purchase package authority is inconsistent");
  }
  authenticLedgerIntents.set(intent, { intent, packageSelectionAuthority });
  return intent;
}

/** @internal Downstream command builders must reject structural look-alikes. */
export function readAuthenticatedBoundedPurchaseLedgerIntent(
  intent: unknown,
): BoundedPurchaseLedgerIntent {
  if (typeof intent !== "object" || intent === null) {
    throw new Error("bounded purchase Ledger intent is not authenticated");
  }
  const state = authenticLedgerIntents.get(intent);
  if (state === undefined) {
    throw new Error("bounded purchase Ledger intent is not authenticated");
  }
  return state.intent;
}

/** @internal Command construction only. */
export function readBoundedPurchaseCommandPackageAuthority(
  intent: unknown,
): BoundedPurchasePackageSelectionAuthority {
  readAuthenticatedBoundedPurchaseLedgerIntent(intent);
  return authenticLedgerIntents.get(intent as object)!
    .packageSelectionAuthority;
}
