/**
 * Sotto API client. Every request goes to NEXT_PUBLIC_API_ORIGIN with
 * credentials included (the `sotto_session` cookie is HTTP-only). Errors
 * carry the API's own taxonomy — `{ error, detail }` — so surfaces can
 * name the failed boundary with the server's exact words.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly body: Readonly<Record<string, unknown>>;

  constructor(status: number, body: Readonly<Record<string, unknown>>) {
    const code = typeof body.error === "string" ? body.error : "unknown-error";
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : `The API answered ${status} without a detail message.`;
    super(`${code}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.body = body;
  }
}

/** Thrown when the API origin itself did not answer. */
export class ApiUnreachableError extends Error {
  constructor() {
    super("The Sotto API did not answer. Check the API service, then reload.");
    this.name = "ApiUnreachableError";
  }
}

export function apiOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  // The API's own default port (apps/api env.ts readPort).
  return origin === undefined || origin === ""
    ? "http://localhost:4400"
    : origin.replace(/\/$/u, "");
}

type RequestOptions = Readonly<{
  method?: "GET" | "POST" | "DELETE";
  body?: Readonly<Record<string, unknown>>;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}>;

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...options.headers,
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiUnreachableError();
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const body =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
    throw new ApiError(response.status, body);
  }
  return payload as T;
}

/** True when the failure means "no owner session" (absent or expired). */
export function isSessionRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function describeFailure(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof ApiUnreachableError) return error.message;
  return "The request failed before the API answered. Retry.";
}
