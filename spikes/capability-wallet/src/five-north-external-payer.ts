import {
  getPublicKeyFromPrivate,
  SDK,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { loadOrCreateExternalPayerPrivateKey } from "./five-north-external-payer-key.js";
import {
  FIVE_NORTH_EXTERNAL_PAYER_VERSION,
  type ExternalPartyCreator,
  type ExternalPartyTopology,
  type FiveNorthExternalPayerInput,
  type FiveNorthExternalPayerResult,
} from "./five-north-external-payer-types.js";

const FINGERPRINT_PATTERN = /^1220[0-9a-f]{64}$/u;
const IDENTIFIER_PATTERN = /^[\x21-\x7e]{1,255}$/u;
const PARTY_HINT_PATTERN = /^sotto-[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const MAX_TOPOLOGY_TRANSACTIONS = 16;
const MAX_TOPOLOGY_BYTES = 2_097_152;

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("external payer onboarding cancelled");
}

function canonicalInput(input: FiveNorthExternalPayerInput) {
  if (!(input.signal instanceof AbortSignal)) {
    throw new Error("external payer onboarding requires an AbortSignal");
  }
  if (!PARTY_HINT_PATTERN.test(input.partyHint)) {
    throw new Error("external payer party hint is invalid");
  }
  if (!IDENTIFIER_PATTERN.test(input.synchronizerId)) {
    throw new Error("external payer synchronizer is invalid");
  }
  if (input.mode !== "dry-run") {
    throw new Error("external payer live onboarding is not implemented");
  }
  return input;
}

function canonicalTopology(
  value: ExternalPartyTopology,
  fingerprint: string,
): ExternalPartyTopology {
  if (
    typeof value !== "object" ||
    value === null ||
    !IDENTIFIER_PATTERN.test(value.partyId) ||
    value.publicKeyFingerprint !== fingerprint ||
    !FINGERPRINT_PATTERN.test(value.publicKeyFingerprint) ||
    typeof value.multiHash !== "string" ||
    value.multiHash.length > 1024 ||
    !Array.isArray(value.topologyTransactions) ||
    value.topologyTransactions.length === 0 ||
    value.topologyTransactions.length > MAX_TOPOLOGY_TRANSACTIONS ||
    value.topologyTransactions.some(
      (entry) =>
        typeof entry !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/u.test(entry),
    ) ||
    value.topologyTransactions.reduce(
      (total, entry) => total + Buffer.byteLength(entry, "utf8"),
      0,
    ) > MAX_TOPOLOGY_BYTES
  ) {
    throw new Error("external payer topology is invalid");
  }
  return value;
}

export async function runFiveNorthExternalPayer(
  candidate: FiveNorthExternalPayerInput,
  dependencies: Readonly<{ createExternalParty: ExternalPartyCreator }>,
): Promise<FiveNorthExternalPayerResult> {
  const input = canonicalInput(candidate);
  active(input.signal);
  const offline = SDK.createOffline();
  const key = await loadOrCreateExternalPayerPrivateKey(input.keyFile, offline);
  try {
    active(input.signal);
    const privateKey = key.toString("base64");
    const publicKey = getPublicKeyFromPrivate(privateKey);
    const fingerprint = await offline.keys.fingerprint(publicKey);
    if (!FINGERPRINT_PATTERN.test(fingerprint)) {
      throw new Error("external payer fingerprint is invalid");
    }
    const creation = dependencies.createExternalParty(publicKey, {
      partyHint: input.partyHint,
      synchronizerId: input.synchronizerId,
    });
    const topology = canonicalTopology(await creation.topology(), fingerprint);
    active(input.signal);
    const recomputed = await offline.utils.hash.topologyTransaction([
      ...topology.topologyTransactions,
    ]);
    if (recomputed !== topology.multiHash) {
      throw new Error("external payer topology hash mismatch");
    }
    signTransactionHash(recomputed, privateKey);
    active(input.signal);
    return Object.freeze({
      fingerprint: fingerprint as `1220${string}`,
      mode: "dry-run" as const,
      mutationSubmitted: false,
      partyHint: input.partyHint,
      proposedPartyId: topology.partyId,
      synchronizerId: input.synchronizerId,
      version: FIVE_NORTH_EXTERNAL_PAYER_VERSION,
    });
  } finally {
    key.fill(0);
  }
}

export type { ExternalPartyCreator, FiveNorthExternalPayerInput };
