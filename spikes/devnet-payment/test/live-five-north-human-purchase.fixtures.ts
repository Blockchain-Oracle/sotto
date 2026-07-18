import { vi } from "vitest";

const PAYER = `sotto-external-payer::1220${"a".repeat(64)}`;
const PROVIDER = `sotto-provider::1220${"b".repeat(64)}`;
const DSO = `DSO::1220${"c".repeat(64)}`;
const SYNCHRONIZER = `global-domain::1220${"d".repeat(64)}`;
export const UPDATE = `1220${"e".repeat(64)}`;
const ATTEMPT = `sha256:${"1".repeat(64)}` as const;
const REQUEST = `sha256:${"2".repeat(64)}` as const;
const CHALLENGE = `sha256:${"3".repeat(64)}` as const;
const PURCHASE = `sha256:${"4".repeat(64)}` as const;
const SESSION = `sha256:${"5".repeat(64)}` as const;
const PREPARED = `sha256:${"6".repeat(64)}` as const;
export const OPERATION = `sha256:${"7".repeat(64)}` as const;
export const SOURCE_COMMIT = "8".repeat(40);

const network = Object.freeze({
  audience: "ledger",
  clientId: "client",
  clientSecret: "secret",
  issuerUrl: "https://issuer.example",
  ledgerUrl: "https://ledger.example",
  scope: "openid",
  tokenUrl: "https://issuer.example/token/",
  validatorUrl: "https://validator.example",
});

export function liveHumanPurchaseInput(events?: string[]) {
  return {
    keyFile: "/workspace/.capability-wallet/payer.key",
    network,
    onJournalInitialized: async () => {
      events?.push("journal-announced");
    },
    port: 8_791,
    providerParty: PROVIDER,
    signal: new AbortController().signal,
    sourceCommit: SOURCE_COMMIT,
    workspaceRoot: "/workspace",
  };
}

export function liveHumanPurchaseDependencies(
  events: string[],
  signingOutcome: "rejected" | "unsupported" | "verified" = "verified",
  completionOutcome: "REJECTED" | "SUCCEEDED" = "SUCCEEDED",
): Readonly<Record<string, unknown>> &
  Readonly<{ markCompletion: unknown; markSettlementReconciled: unknown }> {
  let providerVerify: ((proof: unknown) => Promise<boolean>) | undefined;
  const expectation = {
    attemptId: ATTEMPT,
    challengeId: CHALLENGE,
    commandId: `sotto-human-purchase-v1-${PURCHASE.slice(7)}`,
    dsoParty: DSO,
    payerParty: PAYER,
    providerParty: PROVIDER,
    purchaseCommitment: PURCHASE,
    requestCommitment: REQUEST,
    synchronizerId: SYNCHRONIZER,
  };
  const transactionReader = vi.fn(async () => {
    events.push("provider-transaction");
    return { transaction: { updateId: UPDATE } };
  });
  return {
    authenticateProviderSettlement: vi.fn(() => ({ authenticated: true })),
    createCompletionTransport: vi.fn(() => ({
      readLedgerEnd: async () => {
        events.push("completion-cursor");
        return 41;
      },
      awaitCompletion: async () => {
        events.push("completion");
        return completionOutcome === "SUCCEEDED"
          ? {
              classification: "SUCCEEDED",
              completionOffset: 42,
              updateId: UPDATE,
            }
          : {
              classification: "REJECTED",
              completionOffset: 42,
              statusCode: 7,
            };
      },
    })),
    createExecuteTransport: vi.fn(() => ({
      createDispatch: async () => ({
        preparedTransactionHash: PREPARED,
        sessionId: SESSION,
        submissionId: "123e4567-e89b-42d3-a456-426614174000",
        userId: "five-north-submitter",
        execute: async () => {
          events.push("execute");
          return {
            outcome: "submitted" as const,
            preparedTransactionHash: PREPARED,
          };
        },
      }),
    })),
    createInteractiveWallet: vi.fn(async () => {
      events.push("wallet");
      return { connector: {}, resolveRegisteredPublicKey: vi.fn() };
    }),
    createPackageSelectionClaimer: vi.fn(() => vi.fn()),
    createPrepareTransport: vi.fn(() => ({
      readAmuletRules: async () => {
        events.push("rules");
        return {};
      },
    })),
    createProviderTransactionReader: vi.fn(() => transactionReader),
    createPurchaseReaders: vi.fn(() => ({})),
    createSigningSession: vi.fn(async (_input, _dependencies, options) => {
      events.push("approval");
      if (signingOutcome === "unsupported") {
        return {
          outcome: "unsupported",
          reason: "unsupported-network",
        };
      }
      await options.onApprovalRequested({ sessionId: SESSION });
      if (signingOutcome === "rejected") {
        return {
          outcome: "rejected",
          reason: "user-rejected",
          sessionId: SESSION,
        };
      }
      return {
        outcome: "verified",
        preparedTransactionHash: PREPARED,
        sessionId: SESSION,
      };
    }),
    createWalletPreflight: vi.fn(),
    exportSettlementExpectation: vi.fn(() => ({ persisted: true })),
    initializeJournal: vi.fn(async () => {
      events.push("journal-intent");
      return { directoryName: "journal", operationId: OPERATION };
    }),
    markApprovalRequested: vi.fn(async () => events.push("journal-approval")),
    markCompletion: vi.fn(async () => events.push("journal-completion")),
    markDelivery: vi.fn(async () => events.push("journal-delivery")),
    markExecutionStarted: vi.fn(async () => events.push("journal-execution")),
    markSettlementReconciled: vi.fn(async () =>
      events.push("journal-settlement"),
    ),
    markSignatureVerified: vi.fn(async () => events.push("journal-signature")),
    parseRules: vi.fn(() => ({
      expectedAdmin: DSO,
      synchronizerId: SYNCHRONIZER,
    })),
    prepareAuthority: vi.fn(async (purchaseInput) => {
      events.push("prepare");
      await purchaseInput.createWalletPreflight(purchaseInput.signal);
      purchaseInput.createReaders(purchaseInput.signal, {});
      return { approval: {}, preflight: {}, verified: {} };
    }),
    projectSettlementExpectation: vi.fn(() => expectation),
    readProfile: vi.fn(async () => {
      events.push("profile");
      return {
        fingerprint: `1220${"a".repeat(64)}`,
        party: PAYER,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        synchronizerId: SYNCHRONIZER,
        topologyHash: "topology",
      };
    }),
    reconcileProviderTransaction: vi.fn(() => true),
    recomputeOfficialHash: vi.fn(),
    requirePayerRightsAbsent: vi.fn(async () => events.push("authority")),
    startProviderSession: vi.fn(async (providerInput) => {
      events.push("provider-start");
      providerVerify = providerInput.verifySettlement;
      return {
        close: vi.fn(async () => events.push("provider-close")),
        fetchAuthorized: vi.fn(),
        resourceUrl: "https://paid.example/paid/weather",
        retryPaid: async (proof: unknown) => {
          events.push("paid-retry");
          if (!(await providerVerify?.(proof))) throw new Error("not verified");
          return Response.json({
            paid: true,
            result: { condition: "clear", temperatureCelsius: 24 },
            settlement: { attemptId: ATTEMPT, updateId: UPDATE },
          });
        },
      };
    }),
    withJournalLease: vi.fn(async ({ action }) => {
      events.push("lease-start");
      return action(async () => events.push("lease-owned"));
    }),
  } as Readonly<Record<string, unknown>> &
    Readonly<{ markCompletion: unknown; markSettlementReconciled: unknown }>;
}
