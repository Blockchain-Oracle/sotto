import type {
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from "fastify";
import type { SessionRepository, SottoSession } from "./session-repository.js";

export const SESSION_COOKIE = "sotto_session";

declare module "fastify" {
  interface FastifyRequest {
    sottoSession?: SottoSession;
  }
}

export function readSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw === undefined) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return undefined;
  return unsigned.value;
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  secureOrigin: boolean,
): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: secureOrigin,
    signed: true,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Session guard for owner-only routes. On failure the response names the
 * failed boundary (the Sotto owner session) and the next safe action
 * (establish a session), per the DESIGN.md copy contract.
 */
export function requireSession(
  sessions: SessionRepository,
): preHandlerAsyncHookHandler {
  return async (request, reply) => {
    const token = readSessionToken(request);
    const session =
      token === undefined ? null : await sessions.findByToken(token);
    if (session === null) {
      await reply.status(401).send({
        error: "session-required",
        detail:
          "The owner session is absent, expired, or revoked. Establish a " +
          "session with your Canton party before retrying this request.",
      });
      return;
    }
    request.sottoSession = session;
  };
}

export function sessionOf(request: FastifyRequest): SottoSession {
  const session = request.sottoSession;
  if (session === undefined) {
    throw new Error("route reached without the session guard");
  }
  return session;
}
