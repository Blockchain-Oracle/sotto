import {
  SottoApiError,
  SottoResponseShapeError,
  SottoResponseTooLargeError,
  SottoTransportError,
} from "./errors.js";

export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type FetchLike = (
  url: string,
  init: Readonly<{
    method: string;
    headers: Readonly<Record<string, string>>;
    body?: string;
    signal?: AbortSignal;
    redirect?: "error";
  }>,
) => Promise<Response>;

export type TransportOptions = Readonly<{
  origin: string;
  token?: () => string | undefined;
  fetch?: FetchLike;
  maxResponseBytes?: number;
}>;

export type RequestInput = Readonly<{
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}>;

function normalizedOrigin(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SottoTransportError(`unsupported origin ${origin}`, undefined);
  }
  return url.origin;
}

/** Reads a body with a hard byte bound; over-limit reads fail loudly. */
export async function readBounded(
  response: Response,
  limitBytes: number,
): Promise<string> {
  const body = response.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new SottoResponseTooLargeError(limitBytes);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : concat(chunks, total),
  );
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export type Transport = Readonly<{
  origin: string;
  authorizationHeader(): Readonly<Record<string, string>>;
  request(input: RequestInput): Promise<Readonly<Record<string, unknown>>>;
  fetchRaw(
    path: string,
    headers: Readonly<Record<string, string>>,
    signal: AbortSignal | undefined,
  ): Promise<Response>;
}>;

/**
 * The one HTTP seam of the purchasing core: injectable fetch, bearer-token
 * authorization, bounded JSON reads, verbatim error-code pass-through. No
 * method here can sign anything — the client's authority is the session
 * token and nothing else.
 */
export function createTransport(options: TransportOptions): Transport {
  const origin = normalizedOrigin(options.origin);
  const fetchImpl: FetchLike =
    options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const limit = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const authorizationHeader = (): Readonly<Record<string, string>> => {
    const token = options.token?.();
    return token === undefined ? {} : { authorization: `Bearer ${token}` };
  };

  return Object.freeze({
    origin,
    authorizationHeader,
    request: async ({ method, path, body, signal, headers }) => {
      let response: Response;
      try {
        response = await fetchImpl(`${origin}${path}`, {
          method,
          redirect: "error",
          headers: {
            accept: "application/json",
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
            ...authorizationHeader(),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          ...(signal === undefined ? {} : { signal }),
        });
      } catch (error) {
        throw new SottoTransportError(`${method} ${path}`, error);
      }
      if (response.status === 204) return Object.freeze({});
      const text = await readBounded(response, limit);
      let parsed: unknown;
      try {
        parsed = text === "" ? {} : JSON.parse(text);
      } catch {
        throw new SottoResponseShapeError(
          `${method} ${path} answered non-JSON with status ${response.status}`,
        );
      }
      if (typeof parsed !== "object" || parsed === null) {
        throw new SottoResponseShapeError(
          `${method} ${path} answered a non-object body`,
        );
      }
      const record = parsed as Record<string, unknown>;
      if (!response.ok) {
        throw new SottoApiError(
          response.status,
          record,
          `http-${response.status}`,
        );
      }
      return record;
    },
    fetchRaw: async (path, headers, signal) => {
      try {
        return await fetchImpl(`${origin}${path}`, {
          method: "GET",
          redirect: "error",
          headers: { ...authorizationHeader(), ...headers },
          ...(signal === undefined ? {} : { signal }),
        });
      } catch (error) {
        throw new SottoTransportError(`GET ${path}`, error);
      }
    },
  });
}
