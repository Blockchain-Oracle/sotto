export const RECONCILIATION_SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
export const RECONCILIATION_UPDATE_ID_PATTERN = /^1220[0-9a-f]{64}$/u;
export const RECONCILIATION_LEASE_OWNER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function reconciliationObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

export function reconciliationExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys are invalid`);
  }
}

export function reconciliationInteger(
  value: unknown,
  minimum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} is invalid`);
  }
  return value as number;
}

export function reconciliationText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > 512
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function reconciliationSha256(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !RECONCILIATION_SHA256_PATTERN.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as `sha256:${string}`;
}
