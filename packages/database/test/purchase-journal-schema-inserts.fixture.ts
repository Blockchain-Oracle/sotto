import type { Client } from "pg";

type AttemptReference = Readonly<{ attemptId: string }>;

const sha = (marker: string) => `sha256:${marker.repeat(64)}`;

export async function insertSchemaAuthority(
  client: Client,
  value: AttemptReference,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.private_prepare_authorities
      (attempt_id, authority_schema, aead_algorithm, key_id,
       encryption_generation, nonce, authentication_tag, ciphertext)
     VALUES ($1, 'sotto-private-prepare-authority-v1', 'aes-256-gcm',
       'prepare-key-2026-07', 1, $2, $3, $4)`,
    [
      value.attemptId,
      Buffer.alloc(12, value.attemptId.charCodeAt(7)),
      Buffer.alloc(16, 2),
      Buffer.from([3]),
    ],
  );
}

export async function insertSchemaEvent(
  client: Client,
  value: AttemptReference,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.attempt_events
      (attempt_id, sequence, event_type, event_hash)
     VALUES ($1, 1, 'intent-created', $2)`,
    [value.attemptId, sha(value.attemptId[7]!)],
  );
}

export async function insertSchemaJob(
  client: Client,
  value: AttemptReference,
  jobId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO sotto.outbox_jobs
      (job_id, dedupe_key, attempt_id, event_sequence, kind, state)
     VALUES ($1, $2, $3, 1, 'purchase-prepare', 'ready')`,
    [jobId, sha(jobId.at(-1)!), value.attemptId],
  );
}
