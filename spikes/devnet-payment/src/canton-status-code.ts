const MAX_GOOGLE_RPC_CODE = 16;

export function isGoogleRpcStatusCode(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_GOOGLE_RPC_CODE
  );
}
