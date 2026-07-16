export const PROVIDER_DELIVERY_DURABILITY =
  "process-memory-spike-only; production-requires-postgresql" as const;

export type ProviderDeliveryClaimKey = Readonly<{
  attemptId: string;
  requestCommitment: string;
  updateId: string;
}>;

type ProviderDeliveryOperation = Readonly<{
  deliver: () => Promise<Response>;
  verify: () => Promise<boolean>;
}>;

type CachedResponse = Readonly<{
  body: Uint8Array;
  headers: ReadonlyArray<readonly [string, string]>;
  status: number;
  statusText: string;
}>;

export type InMemoryProviderDeliveryClaims = Readonly<{
  /**
   * This store is intentionally limited to the DevNet spike process. A
   * production provider must atomically persist delivery claims and responses
   * in PostgreSQL before executing an upstream delivery.
   */
  durability: typeof PROVIDER_DELIVERY_DURABILITY;
  claim: (
    key: ProviderDeliveryClaimKey,
    operation: ProviderDeliveryOperation,
  ) => Promise<Response | undefined>;
}>;

const MAX_CACHED_RESPONSE_BYTES = 2_000_000;

function claimIdentity(key: ProviderDeliveryClaimKey): string {
  return JSON.stringify([key.updateId, key.attemptId, key.requestCommitment]);
}

async function boundedResponseBody(response: Response): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declared) ||
      Number(declared) > MAX_CACHED_RESPONSE_BYTES)
  ) {
    throw new Error("provider delivery response exceeds its byte limit");
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CACHED_RESPONSE_BYTES) {
        throw new Error("provider delivery response exceeds its byte limit");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function cacheResponse(response: Response): Promise<CachedResponse> {
  const headers = Object.freeze(
    [...response.headers.entries()].map(([name, value]) =>
      Object.freeze([name, value] as const),
    ),
  );
  return Object.freeze({
    body: await boundedResponseBody(response),
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function restoreResponse(cached: CachedResponse): Response {
  return new Response(cached.body.slice(), {
    headers: cached.headers.map(
      ([name, value]) => [name, value] as [string, string],
    ),
    status: cached.status,
    statusText: cached.statusText,
  });
}

export function createInMemoryProviderDeliveryClaims(): InMemoryProviderDeliveryClaims {
  const claims = new Map<string, Promise<CachedResponse | undefined>>();
  return Object.freeze({
    durability: PROVIDER_DELIVERY_DURABILITY,
    claim: async (key, actions) => {
      const identity = claimIdentity(key);
      let operation = claims.get(identity);
      if (operation === undefined) {
        if (
          typeof actions !== "object" ||
          actions === null ||
          typeof actions.verify !== "function" ||
          typeof actions.deliver !== "function"
        ) {
          throw new Error("provider delivery operation is invalid");
        }
        operation = (async () => {
          let verified: boolean;
          try {
            verified = await actions.verify();
          } catch (error) {
            if (claims.get(identity) === operation) claims.delete(identity);
            throw error;
          }
          if (verified !== true) {
            if (verified !== false) {
              if (claims.get(identity) === operation) claims.delete(identity);
              throw new Error("provider settlement verification is invalid");
            }
            if (claims.get(identity) === operation) claims.delete(identity);
            return undefined;
          }
          try {
            return await cacheResponse(await actions.deliver());
          } catch {
            throw new Error("provider delivery outcome is unknown");
          }
        })();
        claims.set(identity, operation);
      }
      const cached = await operation;
      return cached === undefined ? undefined : restoreResponse(cached);
    },
  });
}
