export * from "./request-binding.js";

export type PaymentChallenge = Readonly<{
  amount: string;
  asset: string;
  expiresAt: string;
  network: string;
  recipient: string;
  requestHash: string;
}>;

const challengeFields = [
  "amount",
  "asset",
  "expiresAt",
  "network",
  "recipient",
  "requestHash",
] as const satisfies ReadonlyArray<keyof PaymentChallenge>;

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Payment challenge must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: Record<string, unknown>,
  field: keyof PaymentChallenge,
): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`Payment challenge requires ${field}`);
  }
  return candidate;
}

export function parsePaymentChallenge(value: unknown): PaymentChallenge {
  const input = objectValue(value);
  const challenge = Object.fromEntries(
    challengeFields.map((field) => [field, requiredString(input, field)]),
  ) as PaymentChallenge;

  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(challenge.amount)) {
    throw new Error("Payment challenge amount must be a non-negative decimal");
  }
  if (Number.isNaN(Date.parse(challenge.expiresAt))) {
    throw new Error("Payment challenge expiresAt must be an ISO timestamp");
  }
  return challenge;
}

export function verifyPreparedPayment(
  challengeValue: unknown,
  preparedValue: unknown,
): PaymentChallenge {
  const challenge = parsePaymentChallenge(challengeValue);
  const prepared = parsePaymentChallenge(preparedValue);

  for (const field of challengeFields) {
    if (challenge[field] !== prepared[field]) {
      throw new Error(`Prepared payment changed ${field}`);
    }
  }
  return prepared;
}
