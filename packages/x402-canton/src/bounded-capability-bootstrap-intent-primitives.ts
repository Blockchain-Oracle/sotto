import { identifier } from "./purchase-commitment-primitives.js";

const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

export function bootstrapIntentSourceCommit(value: unknown): string {
  const commit = identifier(value, "bootstrap source commit", 40);
  if (!SOURCE_COMMIT_PATTERN.test(commit)) {
    throw new Error("bootstrap source commit must be a full Git SHA-1");
  }
  return commit;
}
