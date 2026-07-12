export type CantonPaymentRequirement = Readonly<{
  amount: string;
  asset: string;
  extra: Readonly<{
    assetTransferMethod: "transfer-factory";
    executeBeforeSeconds: number;
    feePayer: string;
    instrumentId: Readonly<{ admin: string; id: string }>;
    memo?: string;
    synchronizerId: string;
  }>;
  maxTimeoutSeconds: number;
  network: `canton:${string}`;
  payTo: string;
  scheme: "exact";
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`Payment requirement requires ${field}`);
  }
  return candidate;
}

function positiveInteger(
  value: Record<string, unknown>,
  field: string,
): number {
  const candidate = value[field];
  if (!Number.isSafeInteger(candidate) || (candidate as number) < 1) {
    throw new Error(`Payment requirement ${field} must be a positive integer`);
  }
  return candidate as number;
}

export function parsePaymentChallenge(
  value: unknown,
): CantonPaymentRequirement {
  const input = objectValue(value, "Payment requirement");
  if (input.scheme !== "exact") {
    throw new Error("Payment requirement scheme must be exact");
  }
  const network = requiredString(input, "network");
  if (!network.startsWith("canton:")) {
    throw new Error("Payment requirement network must be Canton");
  }
  const amount = requiredString(input, "amount");
  if (!/^(?:0|[1-9]\d*)$/.test(amount)) {
    throw new Error("Payment requirement amount must be an atomic integer");
  }

  const asset = requiredString(input, "asset");
  const maxTimeoutSeconds = positiveInteger(input, "maxTimeoutSeconds");
  const extra = objectValue(input.extra, "Payment requirement extra");
  if (extra.assetTransferMethod !== "transfer-factory") {
    throw new Error("Payment requirement must use transfer-factory");
  }
  const executeBeforeSeconds = positiveInteger(extra, "executeBeforeSeconds");
  if (executeBeforeSeconds > maxTimeoutSeconds) {
    throw new Error(
      "Payment requirement executeBeforeSeconds exceeds maxTimeoutSeconds",
    );
  }
  const instrument = objectValue(extra.instrumentId, "instrumentId");
  const instrumentId = {
    admin: requiredString(instrument, "admin"),
    id: requiredString(instrument, "id"),
  };
  if (
    asset.includes("::") &&
    asset !== `${instrumentId.admin}::${instrumentId.id}`
  ) {
    throw new Error("Payment requirement asset conflicts with instrumentId");
  }
  const memo = extra.memo;
  if (memo !== undefined && typeof memo !== "string") {
    throw new Error("Payment requirement memo must be a string");
  }

  return {
    amount,
    asset,
    extra: {
      assetTransferMethod: "transfer-factory",
      executeBeforeSeconds,
      feePayer: requiredString(extra, "feePayer"),
      instrumentId,
      ...(memo === undefined ? {} : { memo }),
      synchronizerId: requiredString(extra, "synchronizerId"),
    },
    maxTimeoutSeconds,
    network: network as `canton:${string}`,
    payTo: requiredString(input, "payTo"),
    scheme: "exact",
  };
}
