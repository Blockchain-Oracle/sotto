import type { FiveNorthWalletRight } from "./five-north-wallet-preflight.js";

const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;
const MAX_RIGHTS = 2_048;
const MAX_SYNCHRONIZERS = 16;
const MAX_TOPOLOGY_TRANSACTIONS = 16;
const MAX_TOPOLOGY_BYTES = 2_097_152;
const UNIT_RIGHT_KINDS = Object.freeze({
  CanExecuteAsAnyParty: "execute-any",
  CanReadAsAnyParty: "read-any",
  IdentityProviderAdmin: "identity-provider-admin",
  ParticipantAdmin: "participant-admin",
} as const);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function text(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function rightParty(value: unknown, label: string): string {
  const wrapper = record(value, label);
  const inner = record(wrapper.value, `${label} value`);
  return text(inner.party, `${label} Party`);
}

function requireUnitRight(value: unknown, label: string): void {
  const wrapper = record(value, label);
  const unit = record(wrapper.value, `${label} value`);
  if (Object.keys(wrapper).length !== 1 || Object.keys(unit).length !== 0) {
    throw new Error(`${label} is invalid`);
  }
}

export function parseAuthenticatedUser(
  value: unknown,
  tokenSubject: string,
): string {
  const user = record(
    record(value, "authenticated user response").user,
    "user",
  );
  const userId = text(user.id, "authenticated user ID", 256);
  if (userId !== tokenSubject) {
    throw new Error("authenticated user does not match token subject");
  }
  return userId;
}

export function parseWalletRights(value: unknown): FiveNorthWalletRight[] {
  const candidates = array(
    record(value, "wallet rights response").rights,
    MAX_RIGHTS,
    "wallet rights",
  );
  const rights = candidates.map((candidate, index): FiveNorthWalletRight => {
    const kind = record(
      record(candidate, `wallet right[${index}]`).kind,
      `wallet right[${index}] kind`,
    );
    const keys = Object.keys(kind);
    if (keys.length !== 1) throw new Error("wallet right kind is ambiguous");
    const key = keys[0]!;
    const unitKind = UNIT_RIGHT_KINDS[key as keyof typeof UNIT_RIGHT_KINDS];
    if (unitKind !== undefined) {
      requireUnitRight(kind[key], `wallet right ${key}`);
      return { kind: unitKind };
    }
    switch (key) {
      case "CanActAs":
        return {
          kind: "act-as",
          party: rightParty(kind[key], key),
        };
      case "CanExecuteAs":
        return {
          kind: "execute-as",
          party: rightParty(kind[key], key),
        };
      case "CanReadAs":
        return {
          kind: "read-as",
          party: rightParty(kind[key], key),
        };
      default:
        throw new Error("wallet right kind is unsupported");
    }
  });
  return Object.freeze(rights) as FiveNorthWalletRight[];
}

export function parseAgentParty(value: unknown, expected: string): boolean {
  const details = array(
    record(value, "agent Party response").partyDetails,
    1,
    "agent Party details",
  );
  return (
    details.length === 1 &&
    text(record(details[0], "agent Party detail").party, "agent Party") ===
      expected
  );
}

export function parseConnectedSynchronizer(
  value: unknown,
  expected: string,
): boolean {
  const entries = array(
    record(value, "connected synchronizer response").connectedSynchronizers,
    MAX_SYNCHRONIZERS,
    "connected synchronizers",
  );
  const identifiers = entries.map((entry, index) =>
    text(
      record(entry, `connected synchronizer[${index}]`).synchronizerId,
      `connected synchronizer[${index}] ID`,
    ),
  );
  return (
    new Set(identifiers).size === identifiers.length &&
    identifiers.includes(expected)
  );
}

export function requireEphemeralPublicKey(value: unknown): string {
  const key = text(value, "external Party public key", 128);
  if (!BASE64.test(key) || Buffer.from(key, "base64").length !== 32) {
    throw new Error("external Party public key is invalid");
  }
  return key;
}

export function parseExternalPartyTopology(
  value: unknown,
  expectedFingerprint: string,
): Readonly<{ multiHash: string; topologyTransactions: readonly string[] }> {
  const topology = record(value, "external Party topology");
  text(topology.partyId, "external Party proposal ID");
  text(topology.multiHash, "external Party topology hash", 1_024);
  if (
    typeof topology.publicKeyFingerprint !== "string" ||
    !FINGERPRINT.test(topology.publicKeyFingerprint) ||
    topology.publicKeyFingerprint !== expectedFingerprint
  ) {
    throw new Error("external Party topology fingerprint is invalid");
  }
  const transactions = array(
    topology.topologyTransactions,
    MAX_TOPOLOGY_TRANSACTIONS,
    "external Party topology transactions",
  );
  let bytes = 0;
  if (transactions.length === 0) {
    throw new Error("external Party topology transactions are empty");
  }
  for (const entry of transactions) {
    const encoded = text(
      entry,
      "external Party topology transaction",
      MAX_TOPOLOGY_BYTES,
    );
    bytes += Buffer.byteLength(encoded);
    if (
      bytes > MAX_TOPOLOGY_BYTES ||
      !BASE64.test(encoded) ||
      Buffer.from(encoded, "base64").toString("base64") !== encoded
    ) {
      throw new Error("external Party topology transaction is invalid");
    }
  }
  return Object.freeze({
    multiHash: topology.multiHash as string,
    topologyTransactions: Object.freeze(transactions as string[]),
  });
}
