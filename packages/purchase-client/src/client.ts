import { SottoResponseShapeError } from "./errors.js";
import type { TransportOptions } from "./http.js";
import { createTransport } from "./http.js";
import type { FollowOptions } from "./sse.js";
import { followPurchaseEvents } from "./sse.js";
import type {
  AttemptEvent,
  AttemptEvidence,
  AttemptSummary,
  CatalogResource,
  HealthReport,
  PublicAttempt,
  PurchaseDetail,
  PurchaseInitiated,
  ResourceHealth,
  StatsReport,
} from "./types.js";

export type SottoClientOptions = TransportOptions;

export type SottoClient = Readonly<{
  origin: string;
  health(signal?: AbortSignal): Promise<HealthReport>;
  session: Readonly<{
    /** True when the configured token resolves to a live owner session. */
    verify(signal?: AbortSignal): Promise<boolean>;
    logout(signal?: AbortSignal): Promise<void>;
  }>;
  catalog: Readonly<{
    listResources(signal?: AbortSignal): Promise<readonly CatalogResource[]>;
    resourceByListing(
      listingId: string,
      signal?: AbortSignal,
    ): Promise<CatalogResource>;
    resourceHealth(
      listingId: string,
      signal?: AbortSignal,
    ): Promise<ResourceHealth>;
  }>;
  purchases: Readonly<{
    initiate(
      listingId: string,
      signal?: AbortSignal,
    ): Promise<PurchaseInitiated>;
    get(attemptId: string, signal?: AbortSignal): Promise<PurchaseDetail>;
    list(
      limit?: number,
      signal?: AbortSignal,
    ): Promise<readonly AttemptSummary[]>;
    follow(
      attemptId: string,
      options?: FollowOptions,
    ): AsyncGenerator<AttemptEvent, void, undefined>;
  }>;
  attempts: Readonly<{
    listPublic(
      limit?: number,
      signal?: AbortSignal,
    ): Promise<readonly PublicAttempt[]>;
    evidence(attemptId: string, signal?: AbortSignal): Promise<AttemptEvidence>;
  }>;
  stats: Readonly<{
    read(window?: string, signal?: AbortSignal): Promise<StatsReport>;
  }>;
}>;

function requireArray<T>(value: unknown, context: string): readonly T[] {
  if (!Array.isArray(value)) throw new SottoResponseShapeError(context);
  return value as readonly T[];
}

function requireRecord<T>(value: unknown, context: string): T {
  if (typeof value !== "object" || value === null) {
    throw new SottoResponseShapeError(context);
  }
  return value as T;
}

/**
 * The one purchasing core (product contract, Agent Interfaces): CLI, MCP,
 * and app consume this identical client so catalog, purchase lifecycle,
 * status, and error semantics cannot drift between surfaces. It holds a
 * session token at most — it has no signing capability of any kind, and
 * every real spend still terminates at the human wallet boundary.
 */
export function createSottoClient(options: SottoClientOptions): SottoClient {
  const transport = createTransport(options);
  const get = (path: string, signal?: AbortSignal) =>
    transport.request({
      method: "GET",
      path,
      ...(signal === undefined ? {} : { signal }),
    });

  const client: SottoClient = {
    origin: transport.origin,
    health: async (signal?: AbortSignal) =>
      requireRecord<HealthReport>(await get("/healthz", signal), "healthz"),
    session: Object.freeze({
      verify: async (signal?: AbortSignal) => {
        try {
          await get("/v1/purchases?limit=1", signal);
          return true;
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as { code: unknown }).code === "session-required"
          ) {
            return false;
          }
          throw error;
        }
      },
      logout: async (signal?: AbortSignal) => {
        await transport.request({
          method: "DELETE",
          path: "/v1/session",
          ...(signal === undefined ? {} : { signal }),
        });
      },
    }),
    catalog: Object.freeze({
      listResources: async (signal?: AbortSignal) =>
        requireArray<CatalogResource>(
          (await get("/v1/resources", signal)).resources,
          "resources",
        ),
      resourceByListing: async (listingId: string, signal?: AbortSignal) =>
        requireRecord<CatalogResource>(
          (await get(`/v1/resources/${encodeURIComponent(listingId)}`, signal))
            .resource,
          "resource",
        ),
      resourceHealth: async (listingId: string, signal?: AbortSignal) => {
        const body = await get(
          `/v1/resources/${encodeURIComponent(listingId)}/health`,
          signal,
        );
        return (body.health ?? null) as ResourceHealth;
      },
    }),
    purchases: Object.freeze({
      initiate: async (listingId: string, signal?: AbortSignal) =>
        requireRecord<PurchaseInitiated>(
          await transport.request({
            method: "POST",
            path: "/v1/purchases",
            body: { listingId },
            ...(signal === undefined ? {} : { signal }),
          }),
          "purchase initiation",
        ),
      get: async (attemptId: string, signal?: AbortSignal) =>
        requireRecord<PurchaseDetail>(
          await get(`/v1/purchases/${encodeURIComponent(attemptId)}`, signal),
          "purchase detail",
        ),
      list: async (limit = 50, signal?: AbortSignal) =>
        requireArray<AttemptSummary>(
          (await get(`/v1/purchases?limit=${limit}`, signal)).attempts,
          "attempts",
        ),
      follow: (attemptId: string, followOptions?: FollowOptions) =>
        followPurchaseEvents(transport, attemptId, followOptions),
    }),
    attempts: Object.freeze({
      listPublic: async (limit = 50, signal?: AbortSignal) =>
        requireArray<PublicAttempt>(
          (await get(`/v1/attempts?limit=${limit}`, signal)).attempts,
          "public attempts",
        ),
      evidence: async (attemptId: string, signal?: AbortSignal) =>
        requireRecord<AttemptEvidence>(
          (await get(`/v1/attempts/${encodeURIComponent(attemptId)}`, signal))
            .attempt,
          "attempt evidence",
        ),
    }),
    stats: Object.freeze({
      read: async (window = "7d", signal?: AbortSignal) =>
        requireRecord<StatsReport>(
          await get(`/v1/stats?window=${encodeURIComponent(window)}`, signal),
          "stats",
        ),
    }),
  };
  return Object.freeze(client);
}
