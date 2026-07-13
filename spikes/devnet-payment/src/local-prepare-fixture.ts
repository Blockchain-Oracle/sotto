type RecordValue = Record<string, unknown>;
export type LocalPrepareBootstrap = Readonly<{
  admin: string;
  agent: string;
  capabilityCid: string;
  executeBefore: string;
  expiresAt: string;
  holdingCid: string;
  mockHoldingCid: string;
  mockTransferFactoryCid: string;
  payer: string;
  provider: string;
  requestedAt: string;
  transferFactoryCid: string;
}>;

export type LocalDisclosure = Readonly<{
  contractId: string;
  createdEventBlob: string;
  synchronizerId: string;
  templateId: string;
}>;

function objectValue(value: unknown, label: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as RecordValue;
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > 512
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function localParty(value: unknown, label: string): string {
  const party = identifier(value, label);
  if (!party.startsWith("sotto-local-prepare-") || !party.includes("::")) {
    throw new Error(`${label} must be an isolated local Party`);
  }
  return party;
}

function time(value: unknown, label: string): string {
  const result = identifier(value, label);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error(`${label} is invalid`);
  return result;
}

export function parseLocalPrepareBootstrap(
  value: unknown,
): LocalPrepareBootstrap {
  const source = objectValue(value, "local prepare bootstrap");
  const result = {
    admin: localParty(source.admin, "local admin"),
    agent: localParty(source.agent, "local agent"),
    capabilityCid: identifier(source.capabilityCid, "local capability CID"),
    executeBefore: time(source.executeBefore, "local executeBefore"),
    expiresAt: time(source.expiresAt, "local expiresAt"),
    holdingCid: identifier(source.holdingCid, "local holding CID"),
    mockHoldingCid: identifier(source.mockHoldingCid, "local mock holding CID"),
    mockTransferFactoryCid: identifier(
      source.mockTransferFactoryCid,
      "local mock factory CID",
    ),
    payer: localParty(source.payer, "local payer"),
    provider: localParty(source.provider, "local provider"),
    requestedAt: time(source.requestedAt, "local requestedAt"),
    transferFactoryCid: identifier(
      source.transferFactoryCid,
      "local factory CID",
    ),
  };
  if (
    result.holdingCid !== result.mockHoldingCid ||
    result.transferFactoryCid !== result.mockTransferFactoryCid
  ) {
    throw new Error("local interface and implementation CIDs must match");
  }
  if (
    Date.parse(result.requestedAt) >= Date.now() ||
    Date.now() >= Date.parse(result.executeBefore) ||
    Date.parse(result.executeBefore) > Date.parse(result.expiresAt)
  ) {
    throw new Error("local prepare execution window is invalid");
  }
  return Object.freeze(result);
}

function canonicalBase64(value: unknown, label: string): string {
  const maximumBytes = 1_000_000;
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > Math.ceil((maximumBytes * 4) / 3) + 4
  ) {
    throw new Error(`${label} is invalid`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength === 0 ||
    decoded.byteLength > maximumBytes ||
    decoded.toString("base64") !== value
  ) {
    throw new Error(`${label} is not canonical base64`);
  }
  return value;
}

export function selectLocalDisclosures(
  response: unknown,
  bootstrap: LocalPrepareBootstrap,
): readonly [LocalDisclosure, LocalDisclosure] {
  if (!Array.isArray(response) || response.length > 32) {
    throw new Error("local ACS result exceeds count limit");
  }
  const wanted = new Set([
    bootstrap.mockTransferFactoryCid,
    bootstrap.mockHoldingCid,
  ]);
  const matches = response.flatMap((candidate) => {
    const entry = objectValue(candidate, "local ACS entry");
    const contractEntry = objectValue(
      entry.contractEntry,
      "local contract entry",
    );
    if (!("JsActiveContract" in contractEntry)) return [];
    const active = objectValue(
      contractEntry.JsActiveContract,
      "local active contract",
    );
    const event = objectValue(active.createdEvent, "local created event");
    const contractId = identifier(
      event.contractId,
      "local disclosed contract ID",
    );
    if (!wanted.has(contractId)) return [];
    const templateId = identifier(
      event.templateId,
      "local disclosed template ID",
    );
    if (!/^[a-f0-9]{64}:[^:\s]+:[^:\s]+$/u.test(templateId)) {
      throw new Error("local disclosed template ID is invalid");
    }
    const [, moduleName, entityName] = templateId.split(":");
    const expectedEntity =
      contractId === bootstrap.mockTransferFactoryCid
        ? "MockTransferFactory"
        : "MockHolding";
    if (
      moduleName !== "SottoControlTokenStandardMock" ||
      entityName !== expectedEntity
    ) {
      throw new Error(
        "local disclosed CID has the wrong expected mock template",
      );
    }
    return [
      Object.freeze({
        contractId,
        createdEventBlob: canonicalBase64(
          event.createdEventBlob,
          "local disclosure blob",
        ),
        synchronizerId: identifier(
          active.synchronizerId,
          "local disclosure synchronizer",
        ),
        templateId,
      }),
    ];
  });
  if (
    matches.length !== 2 ||
    new Set(matches.map(({ contractId }) => contractId)).size !== 2
  ) {
    throw new Error("local ACS must contain exactly two fixture disclosures");
  }
  if (matches[0]!.synchronizerId !== matches[1]!.synchronizerId) {
    throw new Error("local disclosure synchronizers do not match");
  }
  if (
    new Set(matches.map(({ templateId }) => templateId.split(":")[0])).size !==
    1
  ) {
    throw new Error("local disclosures must use the same test package");
  }
  return Object.freeze([matches[0]!, matches[1]!]);
}
