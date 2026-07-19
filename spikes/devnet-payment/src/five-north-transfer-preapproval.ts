export const TRANSFER_PREAPPROVAL_TEMPLATE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f:Splice.AmuletRules:TransferPreapproval" as const;

const PARTY_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;
const MINIMUM_REMAINING_MS = 5 * 60 * 1_000;
const MAXIMUM_TEXT_BYTES = 1_048_576;
const MAXIMUM_ACS_ENTRIES = 16;

type ExpectedPreapproval = Readonly<{
  dso: string;
  provider: string;
  receiver: string;
  synchronizerId: string;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > MAXIMUM_TEXT_BYTES
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function party(value: unknown, label: string): string {
  const result = identifier(value, label);
  if (!PARTY_PATTERN.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function canonicalTime(value: unknown, label: string): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(value)
  ) {
    throw new Error(`${label} lifecycle is invalid`);
  }
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} lifecycle is invalid`);
  }
  return parsed;
}

function validTemplateId(value: unknown): boolean {
  return (
    value === TRANSFER_PREAPPROVAL_TEMPLATE_ID ||
    (typeof value === "string" &&
      /^#[^:\s]+:Splice\.AmuletRules:TransferPreapproval$/u.test(value))
  );
}

function parsePayload(
  value: unknown,
  createdAtValue: unknown,
  synchronizerValue: unknown,
  expected: ExpectedPreapproval,
) {
  const payload = objectValue(value, "transfer preapproval payload");
  exactKeys(
    payload,
    ["dso", "expiresAt", "lastRenewedAt", "provider", "receiver", "validFrom"],
    "transfer preapproval payload",
  );
  const receiver = party(payload.receiver, "preapproval receiver Party");
  const provider = party(payload.provider, "preapproval provider Party");
  const dso = party(payload.dso, "preapproval DSO Party");
  const synchronizerId = party(
    synchronizerValue,
    "preapproval synchronizer ID",
  );
  if (
    receiver !== expected.receiver ||
    provider !== expected.provider ||
    dso !== expected.dso ||
    synchronizerId !== expected.synchronizerId
  ) {
    throw new Error("transfer preapproval does not match expected parties");
  }
  const now = Date.now();
  const validFrom = canonicalTime(payload.validFrom, "preapproval validFrom");
  const lastRenewedAt = canonicalTime(
    payload.lastRenewedAt,
    "preapproval lastRenewedAt",
  );
  const expiresAt = canonicalTime(payload.expiresAt, "preapproval expiresAt");
  const createdAt = canonicalTime(createdAtValue, "preapproval createdAt");
  if (
    validFrom > now ||
    createdAt > now ||
    lastRenewedAt < validFrom ||
    lastRenewedAt > now ||
    expiresAt <= lastRenewedAt ||
    expiresAt - now < MINIMUM_REMAINING_MS
  ) {
    throw new Error("transfer preapproval lifecycle is invalid");
  }
  return Object.freeze({
    expiresAt: payload.expiresAt as string,
    provider,
    receiver,
    synchronizerId,
  });
}

export function parseFiveNorthTransferPreapproval(
  value: unknown,
  expected: ExpectedPreapproval,
) {
  const root = objectValue(value, "transfer preapproval response");
  exactKeys(root, ["transfer_preapproval"], "transfer preapproval response");
  const wrapper = objectValue(
    root.transfer_preapproval,
    "transfer preapproval",
  );
  exactKeys(wrapper, ["contract", "domain_id"], "transfer preapproval");
  const contract = objectValue(
    wrapper.contract,
    "transfer preapproval contract",
  );
  exactKeys(
    contract,
    [
      "contract_id",
      "created_at",
      "created_event_blob",
      "payload",
      "template_id",
    ],
    "transfer preapproval contract",
  );
  if (!validTemplateId(contract.template_id)) {
    throw new Error("transfer preapproval template does not match");
  }
  const parsed = parsePayload(
    contract.payload,
    contract.created_at,
    wrapper.domain_id,
    expected,
  );
  identifier(contract.created_event_blob, "preapproval created event blob");
  return Object.freeze({
    contractId: identifier(contract.contract_id, "preapproval contract ID"),
    ...parsed,
  });
}

export function reconcileFiveNorthTransferPreapprovalAcs(
  value: unknown,
  expected: ExpectedPreapproval,
) {
  if (!Array.isArray(value) || value.length > MAXIMUM_ACS_ENTRIES) {
    throw new Error("transfer preapproval ACS exceeds count limit");
  }
  const expectedPackageId = TRANSFER_PREAPPROVAL_TEMPLATE_ID.split(":")[0]!;
  const matches = value.map((entry) => {
    const contractEntry = objectValue(entry, "preapproval ACS entry");
    const active = objectValue(
      objectValue(contractEntry.contractEntry, "preapproval contract entry")
        .JsActiveContract,
      "preapproval active contract",
    );
    const event = objectValue(active.createdEvent, "preapproval created event");
    if (
      event.packageName !== "splice-amulet" ||
      event.representativePackageId !== expectedPackageId ||
      !validTemplateId(event.templateId) ||
      !Array.isArray(event.signatories) ||
      JSON.stringify([...event.signatories].sort()) !==
        JSON.stringify(
          [expected.receiver, expected.provider, expected.dso].sort(),
        ) ||
      !Number.isSafeInteger(active.reassignmentCounter) ||
      (active.reassignmentCounter as number) < 0
    ) {
      throw new Error("transfer preapproval ACS contract does not match");
    }
    const parsed = parsePayload(
      event.createArgument,
      event.createdAt,
      active.synchronizerId,
      expected,
    );
    return Object.freeze({
      contractId: identifier(event.contractId, "preapproval contract ID"),
      ...parsed,
    });
  });
  return Object.freeze({
    activeCount: value.length,
    matches: Object.freeze(matches),
  });
}
