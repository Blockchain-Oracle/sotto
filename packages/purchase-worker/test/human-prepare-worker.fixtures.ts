import { vi } from "vitest";
import {
  projectHumanPreparedPurchaseApproval,
  type HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import {
  exportHumanPrepareAuthorityPlaintext,
  parseHumanPrepareAuthorityPlaintext,
  restoreHumanPrepareAuthority,
} from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type {
  HumanPrepareCheckpointResult,
  PurchaseRepository,
} from "@sotto/database";
import {
  historicalContextFactoryResponse,
  humanPreparedPurchaseBytes,
} from "../../x402-canton/test/human-prepared-purchase.fixtures.js";
import {
  humanHoldingEntry,
  humanHoldingReader,
} from "../../x402-canton/test/human-purchase-holding.fixtures.js";
import { recomputeWalletPreparedHashPrecheck } from "../../x402-canton/src/prepared-purchase-wallet-precheck.js";
import { responseBytes } from "../../x402-canton/test/transfer-factory-observation.fixtures.js";
import { catalogHumanPurchaseIntent } from "../../database/test/purchase-journal.fixtures.js";
import { freshHumanPrepareAuthority } from "../../database/test/purchase-prepare-authority.fixture.js";

const JOB_ID = "018f3f24-7d4a-7e2c-a421-0f3473b94398";

export async function workerTestContext(
  windowSeconds = 599,
  requestApproval?: Parameters<typeof freshHumanPrepareAuthority>[1],
) {
  const catalogIntent = await catalogHumanPurchaseIntent((challenge) => {
    challenge.accepts[0]!.maxTimeoutSeconds = windowSeconds;
    challenge.accepts[0]!.extra.executeBeforeSeconds = windowSeconds;
  });
  const restored = await freshHumanPrepareAuthority(
    catalogIntent,
    requestApproval,
  );
  const plaintext = exportHumanPrepareAuthorityPlaintext(catalogIntent);
  const intent = restoreHumanPrepareAuthority(
    parseHumanPrepareAuthorityPlaintext(plaintext),
    restored,
  );
  plaintext.fill(0);
  const readers = humanPrepareReaders(intent);
  const lease = Object.freeze({
    jobId: JOB_ID,
    attemptId: intent.attemptId,
    leaseGeneration: 1,
    leaseOwner: "human-prepare-test-worker",
    claimedAt: new Date().toISOString(),
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const completeHumanPrepare = vi.fn(
    async ({ prepared }): Promise<HumanPrepareCheckpointResult> => {
      const approval = projectHumanPreparedPurchaseApproval(prepared);
      const completedAt = new Date().toISOString();
      return Object.freeze({
        outcome: "prepared-hash-verified",
        attemptId: intent.attemptId,
        state: "prepared-hash-verified",
        preparedTransactionHash: approval.preparedTransactionHash,
        transferContextHash: approval.transferContextHash,
        verifiedAt: prepared.verifiedAt,
        event: Object.freeze({
          sequence: 2,
          type: "prepared-hash-verified",
          eventHash: `sha256:${"d".repeat(64)}`,
          previousEventHash: `sha256:${"e".repeat(64)}`,
          recordedAt: completedAt,
        }),
        job: Object.freeze({ jobId: JOB_ID, state: "completed", completedAt }),
      });
    },
  );
  const repository = {
    initializeHumanPurchaseAttempt: vi.fn(),
    claimHumanPrepareAuthority: vi.fn(async (claim) => {
      await claim.resolve({} as never, {} as never, lease);
      return Object.freeze({ lease, intent });
    }),
    completeHumanPrepare,
    close: vi.fn(),
  } as unknown as PurchaseRepository;
  return { completeHumanPrepare, intent, lease, readers, repository, restored };
}

export function humanPrepareReaders(intent: HumanPurchaseLedgerIntent) {
  const holdings = humanHoldingReader([
    humanHoldingEntry(
      "00holding-a",
      "0.3250000000",
      intent.challenge.payerParty,
      intent.challenge.synchronizerId,
    ),
  ]);
  return {
    holdings: {
      readLedgerEnd: vi.fn(holdings.readLedgerEnd),
      readActiveContracts: vi.fn(holdings.readActiveContracts),
    },
    registry: vi.fn(async () =>
      responseBytes(historicalContextFactoryResponse(intent)),
    ),
    prepared: vi.fn(async ({ body }) => {
      const transaction = humanPreparedPurchaseBytes(intent, body);
      const digest = await recomputeWalletPreparedHashPrecheck(transaction);
      return responseBytes({
        preparedTransaction: Buffer.from(transaction).toString("base64"),
        preparedTransactionHash: Buffer.from(digest).toString("base64"),
        hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
        hashingDetails: null,
        costEstimation: null,
      });
    }),
  };
}

export async function officialHash(transaction: Uint8Array) {
  return recomputeWalletPreparedHashPrecheck(transaction);
}
