import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

const SESSION_TTL_MS = 12 * 60 * 60 * 1_000;
const TOKEN_BYTES = 32;
const PARTY = /^[^\s:]{1,128}::1220[0-9a-f]{64}$/u;

export type SottoSession = Readonly<{
  sessionId: string;
  ownerId: string;
  partyId: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type CreatedSottoSession = Readonly<{
  session: SottoSession;
  token: string;
}>;

export type SessionRepository = Readonly<{
  ensureOwner(partyId: string): Promise<string>;
  createSession(
    input: Readonly<{ partyId: string }>,
  ): Promise<CreatedSottoSession>;
  findByToken(token: string): Promise<SottoSession | null>;
  revokeByToken(token: string): Promise<boolean>;
}>;

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function requireParty(partyId: string): string {
  if (!PARTY.test(partyId)) {
    throw new Error("session Party ID is not canonical");
  }
  return partyId;
}

/**
 * `sotto.sessions` store. The opaque 256-bit token itself is never
 * persisted — only its SHA-256 hex lands in `token_hash` — so a database
 * read can never replay a session. Expiry and revocation are enforced in
 * SQL on every lookup; a revoked or expired row is indistinguishable from
 * an absent one.
 */
export function createSessionRepository(pool: Pool): SessionRepository {
  const ensureOwner = async (partyId: string): Promise<string> => {
    const party = requireParty(partyId);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO sotto.owners (id, party_id) VALUES ($1, $2)
       ON CONFLICT (party_id) DO UPDATE SET party_id = EXCLUDED.party_id
       RETURNING id`,
      [randomUUID(), party],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error("owner persistence failed");
    return id;
  };

  return Object.freeze({
    ensureOwner,
    createSession: async ({ partyId }) => {
      const party = requireParty(partyId);
      const ownerId = await ensureOwner(party);
      const token = randomBytes(TOKEN_BYTES).toString("hex");
      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const result = await pool.query<{ issuedAt: Date; expiresAt: Date }>(
        `INSERT INTO sotto.sessions
           (session_id, owner_id, token_hash, party_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING issued_at AS "issuedAt", expires_at AS "expiresAt"`,
        [sessionId, ownerId, tokenHash(token), party, expiresAt],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("session persistence failed");
      return Object.freeze({
        token,
        session: Object.freeze({
          sessionId,
          ownerId,
          partyId: party,
          issuedAt: row.issuedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        }),
      });
    },
    findByToken: async (token) => {
      if (!/^[0-9a-f]{64}$/u.test(token)) return null;
      const result = await pool.query<{
        sessionId: string;
        ownerId: string;
        partyId: string;
        issuedAt: Date;
        expiresAt: Date;
      }>(
        `SELECT session_id AS "sessionId", owner_id AS "ownerId",
                party_id AS "partyId", issued_at AS "issuedAt",
                expires_at AS "expiresAt"
         FROM sotto.sessions
         WHERE token_hash = $1
           AND revoked_at IS NULL
           AND expires_at > clock_timestamp()`,
        [tokenHash(token)],
      );
      const row = result.rows[0];
      if (row === undefined) return null;
      return Object.freeze({
        sessionId: row.sessionId,
        ownerId: row.ownerId,
        partyId: row.partyId,
        issuedAt: row.issuedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      });
    },
    revokeByToken: async (token) => {
      if (!/^[0-9a-f]{64}$/u.test(token)) return false;
      const result = await pool.query(
        `UPDATE sotto.sessions SET revoked_at = clock_timestamp()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash(token)],
      );
      return (result.rowCount ?? 0) > 0;
    },
  });
}
