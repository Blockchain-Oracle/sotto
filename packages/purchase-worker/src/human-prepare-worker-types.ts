import type {
  HumanPrepareAuthorityResolver,
  HumanPrepareCheckpointResult,
  PurchaseRepository,
} from "@sotto/database";
import type {
  AuthenticatedHumanWalletConnectorPreflight,
  HashVerifiedHumanPreparedPurchase,
  HumanPreparedPurchaseApproval,
  HumanPreparedPurchaseHashDependencies,
  HumanPreparedPurchaseReader,
  HumanPurchaseHoldingReader,
  HumanPurchaseLedgerIntent,
  HumanTransferFactoryRegistryReader,
} from "@sotto/x402-canton";

export type HumanPrepareWorkerReaders = Readonly<{
  holdings: HumanPurchaseHoldingReader;
  registry: HumanTransferFactoryRegistryReader;
  prepared: HumanPreparedPurchaseReader;
}>;

export type HumanPrepareWorkerAuthorityResolver = (
  resolution: Parameters<HumanPrepareAuthorityResolver>[0],
  scope: Parameters<HumanPrepareAuthorityResolver>[1],
  options: Readonly<{ signal: AbortSignal }>,
) => ReturnType<HumanPrepareAuthorityResolver>;

export type HumanPrepareWorkerDependencies = Readonly<{
  repository: PurchaseRepository;
  resolveAuthority: HumanPrepareWorkerAuthorityResolver;
  createReaders: (
    intent: HumanPurchaseLedgerIntent,
  ) => HumanPrepareWorkerReaders;
  recomputeOfficialHash: HumanPreparedPurchaseHashDependencies["recomputeOfficialHash"];
}>;

export type HumanPrepareWorkerInput = Readonly<{
  leaseOwner: string;
  signal?: AbortSignal;
}>;

export type HumanPrepareWorkerResult =
  | Readonly<{ outcome: "idle" }>
  | Readonly<{
      outcome: "prepared-hash-verified";
      checkpoint: HumanPrepareCheckpointResult;
      approval: HumanPreparedPurchaseApproval;
      handoff: Readonly<{
        preflight: AuthenticatedHumanWalletConnectorPreflight;
        prepared: HashVerifiedHumanPreparedPurchase;
      }>;
    }>;

export type HumanPrepareWorker = Readonly<{
  runOne(input: HumanPrepareWorkerInput): Promise<HumanPrepareWorkerResult>;
}>;

export type HumanPrepareWorkerErrorCode =
  | "HUMAN_PREPARE_CANCELLED"
  | "HUMAN_PREPARE_LEASE_EXPIRED"
  | "HUMAN_PREPARE_FAILED";

export class HumanPrepareWorkerError extends Error {
  constructor(readonly code: HumanPrepareWorkerErrorCode) {
    super(
      code === "HUMAN_PREPARE_CANCELLED"
        ? "human prepare worker cancelled"
        : code === "HUMAN_PREPARE_LEASE_EXPIRED"
          ? "human prepare worker lease window exhausted"
          : "human prepare worker failed",
    );
    this.name = "HumanPrepareWorkerError";
  }
}
