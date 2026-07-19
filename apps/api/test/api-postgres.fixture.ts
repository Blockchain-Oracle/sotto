import { createServer, type Server } from "node:http";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import {
  catalogHumanPurchaseIntent,
  PURCHASE_SOURCE_COMMIT,
} from "../../../packages/database/test/purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrepareAuthorityKeyring,
  testPrivateDeliveryKeyring,
} from "../../../packages/database/test/purchase-postgres.fixtures.js";
import {
  originProof,
  RESOURCE_ID,
  REVISION_ID,
} from "../../../packages/database/test/publication.fixtures.js";
import { createChallengeStore } from "../src/auth/challenge.js";
import { createSessionRepository } from "../src/auth/session-repository.js";
import { buildServer } from "../src/server.js";
import { createSignerWalletClient } from "../src/signer-client.js";
import { createCatalogReads } from "../src/services/catalog-reads.js";
import { createOpsStore } from "../src/services/ops-store.js";
import { createOriginProofService } from "../src/services/origin-proof.js";
import { createProbeService } from "../src/services/probe-service.js";
import { createPurchaseBindingRegistry } from "../src/services/purchase-binding.js";
import { createPurchaseInitiation } from "../src/services/purchase-initiation.js";
import { createPurchaseReads } from "../src/services/purchase-reads.js";
import { createStatsReads } from "../src/services/stats-reads.js";

const SIGNER_TOKEN = "api-postgres-signer-token-0123456789abcdef";
export const HARNESS_PARTY = `sotto-judge::1220${"7".repeat(64)}`;
export const HARNESS_WALLET_ID = "a".repeat(32);

export type ApiPostgresHarness = Readonly<{
  server: FastifyInstance;
  pool: pg.Pool;
  listingId: string;
  close(): Promise<void>;
}>;

function startFakeSigner(): Promise<{ port: number; server: Server }> {
  const signerServer = createServer((request, response) => {
    const respond = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.headers.authorization !== `Bearer ${SIGNER_TOKEN}`) {
      respond(401, { error: "service-token-required" });
    } else if (
      request.method === "POST" &&
      request.url === "/internal/wallets"
    ) {
      respond(201, {
        fingerprint: `1220${"7".repeat(64)}`,
        partyId: HARNESS_PARTY,
        walletId: HARNESS_WALLET_ID,
      });
    } else if (
      request.method === "POST" &&
      request.url === `/internal/wallets/${HARNESS_WALLET_ID}/link`
    ) {
      respond(201, { linkUrl: `http://127.0.0.1:1/link/test` });
    } else if (
      request.method === "GET" &&
      request.url === `/internal/wallets/${HARNESS_WALLET_ID}/profile`
    ) {
      respond(200, { partyId: HARNESS_PARTY, walletId: HARNESS_WALLET_ID });
    } else {
      respond(404, { error: "unknown" });
    }
  });
  return new Promise((resolve) => {
    signerServer.listen(0, "127.0.0.1", () => {
      const address = signerServer.address();
      if (typeof address === "object" && address !== null) {
        resolve({ port: address.port, server: signerServer });
      }
    });
  });
}

function fake402(): Response {
  const challenge = {
    x402Version: 2,
    resource: { url: "https://weather.example.com/weather/current" },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: "2500000000",
        asset: "CC",
        payTo: "sotto-weather-provider::1220provider",
        maxTimeoutSeconds: 600,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 600,
          feePayer: HARNESS_PARTY,
          instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
          synchronizerId: `global-domain::1220${"b".repeat(64)}`,
        },
      },
    ],
  };
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
        "base64",
      ),
    },
  });
}

/**
 * Boots the real API composition against a migrated disposable PostgreSQL
 * database: real session rows, real catalog and purchase repositories from
 * the built @sotto/database runtime, and a loopback fake signer speaking
 * the signer's internal wallet contract. The only faked purchase seam is
 * the Five North intent assembler, which returns the same authenticated
 * intent the DevNet spike constructs.
 */
export async function startApiPostgresHarness(
  databaseName: string,
  options: Readonly<{ publicAppOrigin?: string; port?: number }> = {},
): Promise<ApiPostgresHarness> {
  const context = await createPurchaseTestRuntime(databaseName);
  const databaseUrl = context.database.databaseUrl;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });

  const catalogRepository = context.runtime.createCatalogRepository({
    databaseUrl,
  });
  await catalogRepository.recordOriginProof(originProof);
  await catalogRepository.publishVerifiedResource({
    publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96020",
    listingId: "018f3f24-7d4a-7e2c-a421-0f3473b96021",
    ownerId: originProof.ownerId,
    originProofId: originProof.proofId,
    resourceId: RESOURCE_ID,
    resourceRevisionId: REVISION_ID,
    expectedListingVersion: 0,
  });
  const listing = await pool.query<{ listingId: string }>(
    `SELECT listing_id AS "listingId" FROM sotto.listings LIMIT 1`,
  );

  const binding = createPurchaseBindingRegistry();
  const purchaseRepository = context.runtime.createPurchaseRepository({
    databaseUrl,
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: binding.resolver,
  });

  const signer = await startFakeSigner();
  const catalog = createCatalogReads(pool);
  const server = await buildServer({
    publicAppOrigin: options.publicAppOrigin ?? "http://127.0.0.1:4400",
    sessionSecret: "postgres-test-session-secret-0123456789",
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    cantonExplorerBaseUrl: undefined,
    fiveNorthConfigured: false,
    opsToken: undefined,
    sessions: createSessionRepository(pool),
    challenges: createChallengeStore("http://127.0.0.1:4400"),
    signer: createSignerWalletClient({
      baseUrl: `http://127.0.0.1:${signer.port}`,
      token: SIGNER_TOKEN,
    }),
    catalog,
    catalogRepository,
    purchaseReads: createPurchaseReads(pool),
    lifecycle: purchaseRepository,
    initiation: createPurchaseInitiation({
      catalog,
      binding,
      repository: purchaseRepository,
      assembler: async () => ({
        intent: await catalogHumanPurchaseIntent(),
        beginExclusive: 42,
      }),
      fetch402: async () => fake402(),
    }),
    probeService: createProbeService(pool, catalogRepository),
    originProof: createOriginProofService(pool, catalogRepository),
    stats: createStatsReads(pool),
    ops: createOpsStore(pool),
    composeAssist: undefined,
    eventPollMilliseconds: 50,
  });
  await server.listen({ host: "127.0.0.1", port: options.port ?? 0 });

  return Object.freeze({
    server,
    pool,
    listingId: listing.rows[0]!.listingId,
    close: async () => {
      await server.close();
      await purchaseRepository.close();
      await catalogRepository.close();
      await pool.end();
      signer.server.close();
      await context.database.drop();
    },
  });
}
