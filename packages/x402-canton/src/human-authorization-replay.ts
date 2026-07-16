import { canonicalTime } from "./purchase-commitment-primitives.js";

export const MAX_ACTIVE_HUMAN_AUTHORIZATIONS = 4_096;
export const HUMAN_AUTHORIZATION_ROLLBACK_TOLERANCE_MS = 5_000;

type ReplayEntry = Readonly<{
  commitment: string;
  retainUntilMs: number;
}>;

type ReplayStoreOptions = Readonly<{
  capacity?: number;
  clock?: () => number;
}>;

export type HumanAuthorizationReplayStore = Readonly<{
  activeCount: () => number;
  reserve: (
    authorizationId: string,
    commitment: string,
    expiresAt: string,
  ) => void;
}>;

export function createHumanAuthorizationReplayStore(
  options: ReplayStoreOptions = {},
): HumanAuthorizationReplayStore {
  const capacity = options.capacity ?? MAX_ACTIVE_HUMAN_AUTHORIZATIONS;
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > MAX_ACTIVE_HUMAN_AUTHORIZATIONS
  ) {
    throw new Error("human authorization replay capacity is invalid");
  }
  const clock = options.clock ?? (() => Date.now());
  const entries = new Map<string, ReplayEntry>();
  let latestObservedAt: number | undefined;

  const reserve: HumanAuthorizationReplayStore["reserve"] = (
    authorizationId,
    commitment,
    expiresAt,
  ) => {
    const now = clock();
    if (!Number.isSafeInteger(now)) {
      throw new Error("human authorization replay clock is invalid");
    }
    if (
      latestObservedAt !== undefined &&
      now < latestObservedAt - HUMAN_AUTHORIZATION_ROLLBACK_TOLERANCE_MS
    ) {
      throw new Error("human authorization replay clock moved backwards");
    }
    const expiresAtMs = canonicalTime(expiresAt, "human authorization expiry");
    const retainUntilMs =
      expiresAtMs + HUMAN_AUTHORIZATION_ROLLBACK_TOLERANCE_MS;
    if (!Number.isSafeInteger(retainUntilMs) || retainUntilMs <= now) {
      throw new Error("human authorization expiry is invalid");
    }
    latestObservedAt = Math.max(latestObservedAt ?? now, now);
    for (const [id, entry] of entries) {
      if (now >= entry.retainUntilMs) entries.delete(id);
    }
    if (entries.has(authorizationId)) {
      throw new Error("human purchase authority is already bound");
    }
    if (entries.size >= capacity) {
      throw new Error("human authorization replay capacity is exhausted");
    }
    entries.set(authorizationId, { commitment, retainUntilMs });
  };

  return Object.freeze({ activeCount: () => entries.size, reserve });
}
