import { recomputeReferenceWalletPreparedHash } from "@sotto/capability-wallet";
import {
  createHumanWalletSigningSession,
  projectHumanSettlementExpectation,
} from "@sotto/x402-canton";
import { exportHumanSettlementExpectation } from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import { createFiveNorthHumanPackageSelectionClaimer } from "./five-north-human-package-preference.js";
import { requireFiveNorthHumanPayerNamedRightsAbsent } from "./five-north-human-payer-authority.js";
import { startFiveNorthHumanProviderSession } from "./five-north-human-provider-session.js";
import { createFiveNorthHumanProviderTransactionReader } from "./five-north-human-provider-transaction.js";
import { createFiveNorthHumanPurchaseReaders } from "./five-north-human-purchase-readers.js";
import { createFiveNorthHumanWalletCompletionTransport } from "./five-north-human-wallet-completion.js";
import { createFiveNorthHumanWalletExecuteTransport } from "./five-north-human-wallet-execute-transport.js";
import { readFiveNorthHumanWalletProfile } from "./five-north-human-wallet-profile.js";
import { createFiveNorthInteractiveHumanWallet } from "./five-north-interactive-human-wallet.js";
import { createFiveNorthReferenceHumanWalletPreflight } from "./five-north-reference-human-wallet.js";
import { parseCapabilityAmuletRules } from "./five-north-capability-readiness-validation.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import {
  initializeHumanPurchaseJournal,
  markHumanPurchaseApprovalRequested,
  markHumanPurchaseCompletion,
  markHumanPurchaseDelivery,
  markHumanPurchaseExecutionStarted,
  markHumanPurchaseSettlementReconciled,
  markHumanPurchaseSignatureVerified,
  withHumanPurchaseJournalLease,
} from "./human-purchase-journal.js";
import {
  authenticateHumanPurchaseProviderSettlement,
  reconcileHumanPurchaseProviderTransaction,
} from "./human-purchase-provider-reconciliation.js";
import { prepareHumanPurchaseAuthority } from "./prepare-human-purchase-authority.js";

export type LiveFiveNorthHumanPurchaseDependencies = Readonly<{
  authenticateProviderSettlement: typeof authenticateHumanPurchaseProviderSettlement;
  createCompletionTransport: typeof createFiveNorthHumanWalletCompletionTransport;
  createExecuteTransport: typeof createFiveNorthHumanWalletExecuteTransport;
  createInteractiveWallet: typeof createFiveNorthInteractiveHumanWallet;
  createPackageSelectionClaimer: typeof createFiveNorthHumanPackageSelectionClaimer;
  createPrepareTransport: typeof createFiveNorthPrepareTransport;
  createProviderTransactionReader: typeof createFiveNorthHumanProviderTransactionReader;
  createPurchaseReaders: typeof createFiveNorthHumanPurchaseReaders;
  createSigningSession: typeof createHumanWalletSigningSession;
  createWalletPreflight: typeof createFiveNorthReferenceHumanWalletPreflight;
  exportSettlementExpectation: typeof exportHumanSettlementExpectation;
  initializeJournal: typeof initializeHumanPurchaseJournal;
  markApprovalRequested: typeof markHumanPurchaseApprovalRequested;
  markCompletion: typeof markHumanPurchaseCompletion;
  markDelivery: typeof markHumanPurchaseDelivery;
  markExecutionStarted: typeof markHumanPurchaseExecutionStarted;
  markSettlementReconciled: typeof markHumanPurchaseSettlementReconciled;
  markSignatureVerified: typeof markHumanPurchaseSignatureVerified;
  parseRules: typeof parseCapabilityAmuletRules;
  prepareAuthority: typeof prepareHumanPurchaseAuthority;
  projectSettlementExpectation: typeof projectHumanSettlementExpectation;
  readProfile: typeof readFiveNorthHumanWalletProfile;
  reconcileProviderTransaction: typeof reconcileHumanPurchaseProviderTransaction;
  recomputeOfficialHash: typeof recomputeReferenceWalletPreparedHash;
  requirePayerRightsAbsent: typeof requireFiveNorthHumanPayerNamedRightsAbsent;
  startProviderSession: typeof startFiveNorthHumanProviderSession;
  withJournalLease: typeof withHumanPurchaseJournalLease;
}>;

export const LIVE_FIVE_NORTH_HUMAN_PURCHASE_DEPENDENCIES: LiveFiveNorthHumanPurchaseDependencies =
  Object.freeze({
    authenticateProviderSettlement: authenticateHumanPurchaseProviderSettlement,
    createCompletionTransport: createFiveNorthHumanWalletCompletionTransport,
    createExecuteTransport: createFiveNorthHumanWalletExecuteTransport,
    createInteractiveWallet: createFiveNorthInteractiveHumanWallet,
    createPackageSelectionClaimer: createFiveNorthHumanPackageSelectionClaimer,
    createPrepareTransport: createFiveNorthPrepareTransport,
    createProviderTransactionReader:
      createFiveNorthHumanProviderTransactionReader,
    createPurchaseReaders: createFiveNorthHumanPurchaseReaders,
    createSigningSession: createHumanWalletSigningSession,
    createWalletPreflight: createFiveNorthReferenceHumanWalletPreflight,
    exportSettlementExpectation: exportHumanSettlementExpectation,
    initializeJournal: initializeHumanPurchaseJournal,
    markApprovalRequested: markHumanPurchaseApprovalRequested,
    markCompletion: markHumanPurchaseCompletion,
    markDelivery: markHumanPurchaseDelivery,
    markExecutionStarted: markHumanPurchaseExecutionStarted,
    markSettlementReconciled: markHumanPurchaseSettlementReconciled,
    markSignatureVerified: markHumanPurchaseSignatureVerified,
    parseRules: parseCapabilityAmuletRules,
    prepareAuthority: prepareHumanPurchaseAuthority,
    projectSettlementExpectation: projectHumanSettlementExpectation,
    readProfile: readFiveNorthHumanWalletProfile,
    reconcileProviderTransaction: reconcileHumanPurchaseProviderTransaction,
    recomputeOfficialHash: recomputeReferenceWalletPreparedHash,
    requirePayerRightsAbsent: requireFiveNorthHumanPayerNamedRightsAbsent,
    startProviderSession: startFiveNorthHumanProviderSession,
    withJournalLease: withHumanPurchaseJournalLease,
  });
