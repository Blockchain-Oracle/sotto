import type { AuthenticatedHumanPayerIdentity } from "./human-payer-identity.js";
import type {
  CanonicalHumanPackageSelection,
  HumanPurchaseCommitment,
} from "./human-purchase-commitment-types.js";
import type { HUMAN_PURCHASE_COMMITMENT_VERSION } from "./human-purchase-commitment.js";
import type {
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
} from "./purchase-commitment-validation.js";

type Sha256 = `sha256:${string}`;

export type HumanPayerSigningIdentity = Readonly<{
  acquiredAt: string;
  keyPurpose: "SIGNING";
  network: `canton:${string}`;
  party: string;
  publicKeyFormat: AuthenticatedHumanPayerIdentity["publicKeyFormat"];
  publicKeyFingerprint: `1220${string}`;
  signatureFormat: AuthenticatedHumanPayerIdentity["signatureFormat"];
  signingAlgorithm: AuthenticatedHumanPayerIdentity["signingAlgorithm"];
  subjectHash: Sha256;
  synchronizerId: string;
  topologyHash: string;
  version: AuthenticatedHumanPayerIdentity["version"];
}>;

export type HumanPurchaseLedgerIntent = Readonly<{
  version: typeof HUMAN_PURCHASE_COMMITMENT_VERSION;
  authorizationMode: "human-wallet";
  actAs: readonly [string];
  attemptId: Sha256;
  purchaseCommitment: Sha256;
  request: Readonly<{
    bindingVersion: "sotto-http-request-v1";
    method: string;
    queryPresent: boolean;
    resourceOrigin: string;
    resourcePath: string;
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
    asset: "CC";
    feePayerParty: string;
    instrument: Readonly<{ admin: string; id: "Amulet" }>;
    synchronizerId: string;
  }>;
  payerIdentity: HumanPayerSigningIdentity;
  limits: Readonly<{
    maximumFeeAtomic: string;
    maximumTotalDebitAtomic: string;
  }>;
  tokenFactory: Readonly<{
    interfaceId: typeof TOKEN_TRANSFER_FACTORY_INTERFACE_ID;
    contractId: string;
    creationTemplateId: typeof FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID;
    expectedAdmin: string;
  }>;
  packageSelection: CanonicalHumanPackageSelection;
}>;

export type HumanPurchaseIntentSource = HumanPurchaseCommitment;
