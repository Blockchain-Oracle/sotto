import type {
  AuthenticatedHumanPackagePreference,
  AuthenticatedHumanWalletConnectorPreflight,
  HashVerifiedHumanPreparedPurchase,
  HttpRequestBindingInput,
  HumanPaymentFetcher,
  HumanPreparedPurchaseApproval,
  HumanPurchaseLedgerIntent,
  HumanPurchaseTrustedConfiguration,
} from "@sotto/x402-canton";
import type { FiveNorthHumanPurchaseReaders } from "./five-north-human-purchase-readers.js";

export type PrepareOnlyHumanPackageSelectionScope = Readonly<{
  adminParty: string;
  challengeId: `sha256:${string}`;
  challengeObservedAt: string;
  executeBefore: string;
  providerParty: string;
  signal: AbortSignal;
  walletPreflight: AuthenticatedHumanWalletConnectorPreflight;
}>;

export type PrepareOnlyHumanPurchaseInput = Readonly<{
  claimPackageSelection: (
    scope: PrepareOnlyHumanPackageSelectionScope,
  ) => Promise<AuthenticatedHumanPackagePreference>;
  createReaders: (
    signal: AbortSignal,
    intent: HumanPurchaseLedgerIntent,
  ) => FiveNorthHumanPurchaseReaders;
  createWalletPreflight: (
    signal: AbortSignal,
  ) => Promise<AuthenticatedHumanWalletConnectorPreflight>;
  expectedProviderParty: string;
  fetchAuthorized: HumanPaymentFetcher;
  maximumFeeAtomic: string;
  recomputeOfficialHash: (
    preparedTransaction: Uint8Array,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<Uint8Array>;
  request: HttpRequestBindingInput;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
  trustedConfiguration: HumanPurchaseTrustedConfiguration;
}>;

export type PrepareOnlyHumanPurchaseResult = Readonly<{
  approval: HumanPreparedPurchaseApproval;
  status: "prepared-hash-verified-not-signed";
  verified: HashVerifiedHumanPreparedPurchase;
}>;
