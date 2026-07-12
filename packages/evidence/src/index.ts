export type AttemptOutcome = "pending" | "accepted" | "failed" | "unknown";
export type DeliveryOutcome = "pending" | "succeeded" | "failed" | "unknown";

export type EvidenceRecord = Readonly<{
  attemptId: string;
  delivery: DeliveryOutcome;
  settlement: AttemptOutcome;
  updateId?: string;
}>;

const forbiddenFields = new Set([
  "authorization",
  "authorizationHeader",
  "payerKey",
  "preparedTransaction",
  "privateKey",
  "prompt",
  "requestBody",
  "responseBody",
  "result",
]);
const settlementOutcomes = new Set<AttemptOutcome>([
  "accepted",
  "failed",
  "pending",
  "unknown",
]);
const deliveryOutcomes = new Set<DeliveryOutcome>([
  "failed",
  "pending",
  "succeeded",
  "unknown",
]);

function requiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Evidence requires ${field}`);
  }
  return value;
}

export function createEvidenceRecord(
  input: Readonly<Record<string, unknown>>,
): EvidenceRecord {
  const forbidden = Object.keys(input).find((field) =>
    forbiddenFields.has(field),
  );
  if (forbidden !== undefined) {
    throw new Error(`Evidence must not contain ${forbidden}`);
  }

  const settlement = requiredString(input, "settlement") as AttemptOutcome;
  const delivery = requiredString(input, "delivery") as DeliveryOutcome;
  if (!settlementOutcomes.has(settlement)) {
    throw new Error(`Unknown settlement outcome: ${settlement}`);
  }
  if (!deliveryOutcomes.has(delivery)) {
    throw new Error(`Unknown delivery outcome: ${delivery}`);
  }
  const updateId = input.updateId;
  if (updateId !== undefined && typeof updateId !== "string") {
    throw new Error("Evidence updateId must be a string");
  }

  return {
    attemptId: requiredString(input, "attemptId"),
    delivery,
    settlement,
    ...(updateId === undefined ? {} : { updateId }),
  };
}
