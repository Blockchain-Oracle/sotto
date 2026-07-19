import { randomBytes, randomUUID } from "node:crypto";
import type { PublicPublishedResource } from "@sotto/database";
import { createChallengeStore } from "../src/auth/challenge.js";
import type {
  SessionRepository,
  SottoSession,
} from "../src/auth/session-repository.js";
import type { ApiDependencies } from "../src/dependencies.js";
import type { SignerWalletResult } from "../src/signer-client.js";

export const TEST_ORIGIN = "http://127.0.0.1:4400";
export const TEST_SOURCE_COMMIT = "cfe1a6386fb555b6e081cc1dc6480527ce5e9b56";
export const TEST_PARTY = `sotto-owner::1220${"a".repeat(64)}`;

export function memorySessionRepository(): SessionRepository & {
  readonly sessions: Map<string, SottoSession>;
} {
  const sessions = new Map<string, SottoSession>();
  const owners = new Map<string, string>();
  const ensureOwner = async (partyId: string) => {
    const existing = owners.get(partyId);
    if (existing !== undefined) return existing;
    const id = randomUUID();
    owners.set(partyId, id);
    return id;
  };
  return {
    sessions,
    ensureOwner,
    createSession: async ({ partyId }) => {
      const token = randomBytes(32).toString("hex");
      const session: SottoSession = {
        sessionId: randomUUID(),
        ownerId: await ensureOwner(partyId),
        partyId,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      sessions.set(token, session);
      return { token, session };
    },
    findByToken: async (token) => sessions.get(token) ?? null,
    revokeByToken: async (token) => sessions.delete(token),
  };
}

export function publishedResource(
  overrides: Partial<PublicPublishedResource> = {},
): PublicPublishedResource {
  return Object.freeze({
    resourceId: "018f3f24-7d4a-7e2c-a421-0f3473b96005",
    resourceRevisionId: "018f3f24-7d4a-7e2c-a421-0f3473b96006",
    listingVersion: 1,
    providerId: "018f3f24-7d4a-7e2c-a421-0f3473b96002",
    providerDisplayName: "Real Weather API",
    normalizedOrigin: "https://weather.example.com",
    name: "Current weather",
    description: "Return current weather for one location.",
    method: "GET",
    routeTemplate: "/weather/current",
    x402Version: 2 as const,
    scheme: "exact" as const,
    network: "canton:devnet",
    asset: "CC",
    recipient: "sotto-weather-provider::1220provider",
    amountAtomic: "2500000000",
    transferMethod: "transfer-factory" as const,
    lastVerifiedAt: "2026-07-18T00:00:01.000Z",
    ...overrides,
  });
}

export function signerResult(
  status: number,
  body: Record<string, unknown>,
): SignerWalletResult {
  return Object.freeze({ status, body: Object.freeze(body) });
}

const unavailable = (): never => {
  throw new Error("dependency not faked for this test");
};

/** Baseline dependency set; individual tests override the seams they use. */
export function fakeDependencies(
  overrides: Partial<ApiDependencies> = {},
): ApiDependencies {
  return Object.freeze({
    publicAppOrigin: TEST_ORIGIN,
    sessionSecret: "test-session-secret-0123456789abcdef",
    sourceCommit: TEST_SOURCE_COMMIT,
    cantonExplorerBaseUrl: undefined,
    fiveNorthConfigured: false,
    opsToken: undefined,
    sessions: memorySessionRepository(),
    challenges: createChallengeStore(TEST_ORIGIN),
    signer: {
      createWallet: unavailable,
      fundWallet: unavailable,
      linkWallet: unavailable,
      readWalletProfile: unavailable,
      readWalletProfileByParty: unavailable,
    },
    catalog: {
      listResources: async () => Object.freeze([]),
      resourceByListing: async () => null,
      latestHealth: async () => null,
    },
    catalogRepository: new Proxy({} as never, {
      get: () => unavailable,
    }),
    purchaseReads: {
      listForOwner: async () => Object.freeze([]),
      aggregateByAttemptId: async () => null,
      eventsSince: async () => Object.freeze([]),
      listPublicAttempts: async () => Object.freeze([]),
      publicAttemptById: async () => null,
      settlementFacts: async () => null,
      deliveryFacts: async () => null,
    },
    lifecycle: { readHumanPurchaseLifecycle: unavailable },
    initiation: { initiate: unavailable },
    probeService: { probe: unavailable },
    originProof: {
      issueChallenge: unavailable,
      verifyChallenge: unavailable,
    },
    stats: {
      attemptCounts: async () =>
        Object.freeze({
          attempts: 0,
          executed: 0,
          settled: 0,
          settlementRejected: 0,
          delivered: 0,
          deliveryFailed: 0,
        }),
      probeCounts: async () =>
        Object.freeze({ observations: 0, healthy: 0, degraded: 0, failing: 0 }),
      latestWorkerHeartbeat: async () => null,
      ping: async () => true,
    },
    ops: {
      listListings: async () => Object.freeze([]),
      setListingState: async () => "unknown" as const,
    },
    composeAssist: undefined,
    eventPollMilliseconds: 25,
    ...overrides,
  });
}
