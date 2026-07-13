import { randomBytes } from "node:crypto";
import {
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  SOTTO_CONTROL_PACKAGE_ID,
  buildBoundedCapabilityBootstrap,
  type BoundedCapabilityBootstrapInput,
} from "@sotto/x402-canton";

const PARTY_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;
const MAXIMUM_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export type FiveNorthCapabilityAuthorityReader = Readonly<{
  readAmuletRules: () => Promise<unknown>;
  readAuthenticatedUserId: () => Promise<string>;
  readLedgerEnd: () => Promise<unknown>;
  readPackagePresence: (packageId: string) => Promise<unknown>;
  readPreferredSottoPackage: (
    payerParty: string,
    agentParty: string,
  ) => Promise<unknown>;
  readTransferFactoryContracts: (
    dsoParty: string,
    activeAtOffset: number,
  ) => Promise<unknown>;
}>;

declare const authorityBrand: unique symbol;
export type FiveNorthCapabilityAuthorityObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [authorityBrand]: true;
}>;

type AuthorityState = {
  capturedAt: number;
  claimed: boolean;
  expectedAdmin: string;
  packageId: typeof SOTTO_CONTROL_PACKAGE_ID;
  synchronizerId: string;
  transferFactoryContractId: string;
  userId: string;
  payerParty: string;
  agentParty: string;
};

const states = new WeakMap<object, AuthorityState>();

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximum
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function party(value: unknown, label: string, sottoOnly = false): string {
  const result = identifier(value, label);
  if (
    !PARTY_PATTERN.test(result) ||
    (sottoOnly && !result.startsWith("sotto-"))
  ) {
    throw new Error(`${label} is invalid`);
  }
  return result;
}

function only(value: unknown, expected: string, label: string): void {
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== expected) {
    throw new Error(`${label} does not match the factory`);
  }
}

function parsePackagePresence(value: unknown): void {
  const presence = objectValue(value, "sotto-control package presence");
  if (
    Object.keys(presence).sort().join(",") !==
      "archivePayloadSha256,packageId" ||
    presence.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    presence.archivePayloadSha256 !== SOTTO_CONTROL_PACKAGE_ID
  ) {
    throw new Error("sotto-control package presence does not match");
  }
}

function parseLedgerEnd(value: unknown): number {
  const ledgerEnd = objectValue(value, "capability authority ledger end");
  if (
    Object.keys(ledgerEnd).join(",") !== "offset" ||
    !Number.isSafeInteger(ledgerEnd.offset) ||
    (ledgerEnd.offset as number) < 0
  ) {
    throw new Error("capability authority ledger end is invalid");
  }
  return ledgerEnd.offset as number;
}

function parseAmuletRules(value: unknown) {
  const root = objectValue(value, "AmuletRules response");
  const rules = objectValue(root.amulet_rules, "AmuletRules contract");
  const contract = objectValue(rules.contract, "AmuletRules payload wrapper");
  const payload = objectValue(contract.payload, "AmuletRules payload");
  return Object.freeze({
    dso: party(payload.dso, "AmuletRules DSO Party"),
    synchronizerId: party(rules.domain_id, "AmuletRules synchronizer ID"),
  });
}

function parseFactory(value: unknown, dso: string, synchronizerId: string) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("Five North must expose exactly one TransferFactory");
  }
  const entry = objectValue(value[0], "TransferFactory ACS entry");
  const wrapper = objectValue(
    entry.contractEntry,
    "TransferFactory contract entry",
  );
  const active = objectValue(
    wrapper.JsActiveContract,
    "TransferFactory active contract",
  );
  const event = objectValue(active.createdEvent, "TransferFactory event");
  const expectedPackageId =
    FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID.split(":")[0]!;
  const argument = objectValue(
    event.createArgument,
    "TransferFactory create argument",
  );
  only(event.signatories, dso, "TransferFactory signatories");
  if (active.synchronizerId !== synchronizerId) {
    throw new Error("Five North TransferFactory synchronizer does not match");
  }
  if (
    !Array.isArray(event.observers) ||
    event.observers.length !== 0 ||
    event.templateId !== FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID ||
    event.packageName !== "splice-amulet" ||
    event.representativePackageId !== expectedPackageId ||
    argument.dso !== dso ||
    Object.keys(argument).join(",") !== "dso" ||
    !Number.isSafeInteger(active.reassignmentCounter) ||
    (active.reassignmentCounter as number) < 0
  ) {
    throw new Error("Five North TransferFactory does not match trusted state");
  }
  return identifier(event.contractId, "TransferFactory contract ID");
}

function parsePreferredPackage(value: unknown, synchronizerId: string): void {
  const preferred = objectValue(value, "preferred sotto-control package");
  if (
    Object.keys(preferred).sort().join(",") !==
      "packageReferences,synchronizerId" ||
    preferred.synchronizerId !== synchronizerId ||
    !Array.isArray(preferred.packageReferences) ||
    preferred.packageReferences.length !== 1
  ) {
    throw new Error("preferred sotto-control package does not match");
  }
  const reference = objectValue(
    preferred.packageReferences[0],
    "preferred sotto-control package reference",
  );
  if (
    Object.keys(reference).sort().join(",") !==
      "packageId,packageName,packageVersion" ||
    reference.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    reference.packageName !== "sotto-control" ||
    reference.packageVersion !== "0.2.0"
  ) {
    throw new Error("preferred sotto-control package is unsupported");
  }
}

export function createFiveNorthCapabilityAuthorityObserver(
  reader: FiveNorthCapabilityAuthorityReader,
): (
  scope: Readonly<{ agentParty: string; payerParty: string }>,
) => Promise<FiveNorthCapabilityAuthorityObservation> {
  return async (scope) => {
    const payerParty = party(scope.payerParty, "capability payer", true);
    const agentParty = party(scope.agentParty, "capability agent", true);
    if (payerParty === agentParty) {
      throw new Error("capability payer and agent must be distinct");
    }
    const acquisitionStartedAt = Date.now();
    const [rulesValue, userIdValue, packageValue, ledgerEndValue] =
      await Promise.all([
        reader.readAmuletRules(),
        reader.readAuthenticatedUserId(),
        reader.readPackagePresence(SOTTO_CONTROL_PACKAGE_ID),
        reader.readLedgerEnd(),
      ]);
    parsePackagePresence(packageValue);
    const rules = parseAmuletRules(rulesValue);
    const activeAtOffset = parseLedgerEnd(ledgerEndValue);
    const [factoryValue, preferredValue, finalUserIdValue] = await Promise.all([
      reader.readTransferFactoryContracts(rules.dso, activeAtOffset),
      reader.readPreferredSottoPackage(payerParty, agentParty),
      reader.readAuthenticatedUserId(),
    ]);
    const transferFactoryContractId = parseFactory(
      factoryValue,
      rules.dso,
      rules.synchronizerId,
    );
    parsePreferredPackage(preferredValue, rules.synchronizerId);
    const userId = identifier(userIdValue, "authenticated user ID", 256);
    if (
      identifier(finalUserIdValue, "final authenticated user ID", 256) !==
      userId
    ) {
      throw new Error("authenticated user changed during authority discovery");
    }
    const capturedAt = Date.now();
    if (
      capturedAt < acquisitionStartedAt - CLOCK_ROLLBACK_TOLERANCE_MS ||
      capturedAt - acquisitionStartedAt > MAXIMUM_AGE_MS
    ) {
      throw new Error("capability authority acquisition is stale");
    }
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt: new Date(capturedAt).toISOString(),
    }) as FiveNorthCapabilityAuthorityObservation;
    states.set(observation, {
      capturedAt: acquisitionStartedAt,
      claimed: false,
      expectedAdmin: rules.dso,
      packageId: SOTTO_CONTROL_PACKAGE_ID,
      synchronizerId: rules.synchronizerId,
      transferFactoryContractId,
      userId,
      payerParty,
      agentParty,
    });
    return observation;
  };
}

type PolicyInput = Omit<
  BoundedCapabilityBootstrapInput,
  "instrument" | "synchronizerId" | "transferFactoryContractId" | "userId"
>;

export function buildFiveNorthCapabilityBootstrap(
  observation: unknown,
  policy: PolicyInput,
) {
  if (typeof observation !== "object" || observation === null) {
    throw new Error("capability authority observation is not authenticated");
  }
  const state = states.get(observation);
  if (state === undefined) {
    throw new Error("capability authority observation is not authenticated");
  }
  const age = Date.now() - state.capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("capability authority clock moved backwards");
  }
  if (age > MAXIMUM_AGE_MS) {
    throw new Error("capability authority observation is stale");
  }
  if (state.claimed) {
    throw new Error("capability authority observation is already claimed");
  }
  if (
    policy.payerParty !== state.payerParty ||
    policy.agentParty !== state.agentParty
  ) {
    throw new Error("capability policy actors do not match authority scope");
  }
  const request = buildBoundedCapabilityBootstrap({
    ...policy,
    instrument: { admin: state.expectedAdmin, id: "Amulet" },
    synchronizerId: state.synchronizerId,
    transferFactoryContractId: state.transferFactoryContractId,
    userId: state.userId,
  });
  state.claimed = true;
  return request;
}
