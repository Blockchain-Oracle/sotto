export const MAX_HUMAN_PURCHASE_CANONICAL_BYTES = 32_768;

export function encodeBoundedHumanPurchaseCanonical(
  source: string,
): Uint8Array {
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > MAX_HUMAN_PURCHASE_CANONICAL_BYTES) {
    throw new Error("human purchase canonical exceeds 32768 bytes");
  }
  return bytes;
}
