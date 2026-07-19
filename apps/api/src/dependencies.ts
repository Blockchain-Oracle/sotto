import type {
  CatalogRepository,
  HumanPurchaseLifecycle,
} from "@sotto/database";
import type { ChallengeStore } from "./auth/challenge.js";
import type { SessionRepository } from "./auth/session-repository.js";
import type { SignerWalletClient } from "./signer-client.js";
import type { CatalogReads } from "./services/catalog-reads.js";
import type { ComposeAssistService } from "./services/compose-assist.js";
import type { OpsStore } from "./services/ops-store.js";
import type { OriginProofService } from "./services/origin-proof.js";
import type { ProbeService } from "./services/probe-service.js";
import type { PurchaseInitiation } from "./services/purchase-initiation.js";
import type { PurchaseReads } from "./services/purchase-reads.js";
import type { StatsReads } from "./services/stats-reads.js";

export type LifecycleReader = Readonly<{
  readHumanPurchaseLifecycle(
    attemptId: `sha256:${string}`,
  ): Promise<HumanPurchaseLifecycle>;
}>;

/**
 * Everything `buildServer` wires into routes. The composition root backs
 * each seam with PostgreSQL, the signer service, and live Five North
 * transports; unit tests inject fakes at exactly these seams. No route
 * performs I/O through anything not listed here.
 */
export type ApiDependencies = Readonly<{
  publicAppOrigin: string;
  sessionSecret: string;
  sourceCommit: string;
  cantonExplorerBaseUrl: string | undefined;
  fiveNorthConfigured: boolean;
  opsToken: string | undefined;
  sessions: SessionRepository;
  challenges: ChallengeStore;
  signer: SignerWalletClient;
  catalog: CatalogReads;
  catalogRepository: CatalogRepository;
  purchaseReads: PurchaseReads;
  lifecycle: LifecycleReader;
  initiation: PurchaseInitiation;
  probeService: ProbeService;
  originProof: OriginProofService;
  stats: StatsReads;
  ops: OpsStore;
  composeAssist: ComposeAssistService | undefined;
  eventPollMilliseconds?: number;
}>;
