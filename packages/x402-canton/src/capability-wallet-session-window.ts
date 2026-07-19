import { MINIMUM_BOOTSTRAP_CAPABILITY_LIFETIME_MS } from "./bounded-capability-bootstrap-state.js";
import { MAX_CAPABILITY_WALLET_SESSION_MS } from "./capability-wallet-connector-types.js";

export function capabilityWalletSessionExpiresAt(input: {
  capabilityExpiresAt: string;
  preparedCapturedAt: number;
  startedAt: number;
  timeoutMilliseconds: number;
}): number {
  const capabilityExpiresAt = Date.parse(input.capabilityExpiresAt);
  const candidates = [
    input.startedAt + input.timeoutMilliseconds,
    input.preparedCapturedAt + MAX_CAPABILITY_WALLET_SESSION_MS,
    capabilityExpiresAt - MINIMUM_BOOTSTRAP_CAPABILITY_LIFETIME_MS,
  ];
  if (candidates.some((candidate) => !Number.isSafeInteger(candidate))) {
    throw new Error("capability wallet signing deadline is invalid");
  }
  return Math.min(...candidates);
}
