import type {
  CapabilityWalletApprovalRequest,
  CapabilityWalletCapabilities,
  CapabilityWalletConnector,
  CapabilityWalletSignatureEnvelope,
} from "@sotto/x402-canton";
import type { WalletHandoffStorage } from "./wallet-handoff-storage.js";

export const REFERENCE_WALLET_REQUEST_VERSION =
  "sotto-reference-wallet-request-v1" as const;
export const REFERENCE_WALLET_RESPONSE_VERSION =
  "sotto-reference-wallet-response-v1" as const;

export type SerializedReferenceWalletRequest = Omit<
  CapabilityWalletApprovalRequest,
  "preparedTransaction"
> &
  Readonly<{ preparedTransaction: string }>;

export type ReferenceWalletRequestPayload = Readonly<{
  request: SerializedReferenceWalletRequest;
  version: typeof REFERENCE_WALLET_REQUEST_VERSION;
}>;

export type ReferenceWalletApprovalResponse =
  | Readonly<{ outcome: "rejected"; reason: "user-rejected" }>
  | Readonly<{
      outcome: "approved";
      signature: CapabilityWalletSignatureEnvelope;
    }>;

export type ReferenceWalletResponsePayload = Readonly<{
  response: ReferenceWalletApprovalResponse;
  sessionId: `sha256:${string}`;
  version: typeof REFERENCE_WALLET_RESPONSE_VERSION;
}>;

export type ReferenceWalletConnectorInput = Readonly<{
  capabilities: CapabilityWalletCapabilities;
  exchange: (
    handoffId: string,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<void>;
  storage: WalletHandoffStorage;
}>;

export type ReferenceWalletConnector = CapabilityWalletConnector;

type ReferenceWalletRunBase = Readonly<{
  handoffId: string;
  presentSummary: (summary: string) => void | Promise<void>;
  rootDirectory: string;
  signal?: AbortSignal;
  walletPolicy: ReferenceWalletPolicy;
}>;

export type ReferenceWalletIdentityPolicy = Readonly<{
  agentParty: string;
  connectorId: string;
  connectorOrigin: string;
  instrumentAdmin: string;
  instrumentId: string;
  network: `canton:${string}`;
  packageId: string;
  payerParty: string;
  signingFingerprint: string;
  synchronizerId: string;
  templateId: string;
  transferFactoryContractId: string;
}>;

export type ReferenceWalletPolicyAuthorization = Readonly<{
  approvalMode: "policy";
  authorizationId: `sha256:${string}`;
  maximumApprovals: 1;
  maximumCapabilityLifetimeSeconds: number;
  maximumTotalDebitAtomic: string;
  perCallLimitAtomic: string;
  recipientParty: string;
  remainingAllowanceAtomic: string;
  resourceHash: `sha256:${string}`;
  revision: string;
  validUntil: string;
  version: "sotto-reference-wallet-policy-v2";
}>;

export type ReferenceWalletPolicy =
  | ReferenceWalletIdentityPolicy
  | (ReferenceWalletIdentityPolicy & ReferenceWalletPolicyAuthorization);

export type ReferenceWalletRunInput = ReferenceWalletRunBase &
  (
    | Readonly<{ approved: false; keyFile?: never }>
    | Readonly<{
        approved: true;
        authorization:
          | Readonly<{ mode: "interactive" }>
          | Readonly<{ mode: "policy"; policyFile: string }>;
        keyFile: string;
      }>
  );
