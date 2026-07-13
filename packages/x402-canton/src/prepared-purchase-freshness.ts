export const MAX_PREPARED_PURCHASE_AGE_MS = 10_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export function requirePreparedPurchaseFresh(
  capturedAt: number,
  executeBefore: string,
  subject: string,
): number {
  const now = Date.now();
  const age = now - capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("prepared Purchase clock moved backwards");
  }
  if (now >= Date.parse(executeBefore)) {
    throw new Error("prepared Purchase execution window is closed");
  }
  if (age > MAX_PREPARED_PURCHASE_AGE_MS) {
    throw new Error(`${subject} is stale`);
  }
  return now;
}
