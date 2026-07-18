import { createHash } from "node:crypto";

type PrepareEventIdentity = Readonly<{
  attemptId: string;
  preparedTransactionHash: string;
  transferContextHash: string;
  verifiedAt: string;
  previousEventHash: string;
}>;

function digest(fields: readonly string[]): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(fields.join("\0"), "utf8")
    .digest("hex")}`;
}

export function legacyPreparedEventHash(
  identity: PrepareEventIdentity,
): `sha256:${string}` {
  return digest([
    "sotto-prepared-hash-verified-event-v1",
    identity.attemptId,
    identity.preparedTransactionHash,
    identity.transferContextHash,
    identity.verifiedAt,
    identity.previousEventHash,
  ]);
}

export function settlementPreparedEventHash(
  identity: PrepareEventIdentity &
    Readonly<{ expectationSchema: string; expectationDigest: string }>,
): `sha256:${string}` {
  return digest([
    "sotto-prepared-hash-verified-event-v2",
    identity.attemptId,
    identity.preparedTransactionHash,
    identity.transferContextHash,
    identity.verifiedAt,
    identity.expectationSchema,
    identity.expectationDigest,
    identity.previousEventHash,
  ]);
}
