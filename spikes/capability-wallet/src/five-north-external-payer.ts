import {
  getPublicKeyFromPrivate,
  SDK,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { loadOrCreateExternalPayerPrivateKey } from "./five-north-external-payer-key.js";
import {
  markExternalPayerExecutionStarted,
  requireExternalPayerNotSubmitted,
} from "./five-north-external-payer-journal.js";
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

function encodedTopologyIsBounded(value: ReadonlyArray<unknown>): boolean {
  let total = 0;
  for (const entry of value) {
    if (typeof entry !== "string") return false;
    total += Buffer.byteLength(entry, "utf8");
    if (total > MAX_TOPOLOGY_BYTES) return false;
  }
  return true;
}

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
  if (input.mode !== "dry-run" && input.mode !== "live") {
    throw new Error("external payer onboarding mode is invalid");
  }
  if (
    (input.mode === "live" &&
      (input.expectedFingerprint === undefined ||
        !FINGERPRINT_PATTERN.test(input.expectedFingerprint))) ||
    (input.mode === "dry-run" && input.expectedFingerprint !== undefined)
  ) {
    throw new Error("external payer expected fingerprint is invalid");
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
    !encodedTopologyIsBounded(value.topologyTransactions) ||
    value.topologyTransactions.some(
      (entry) =>
        typeof entry !== "string" ||
        entry === "" ||
        !/^[A-Za-z0-9+/]*={0,2}$/u.test(entry) ||
        Buffer.from(entry, "base64").toString("base64") !== entry,
    )
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
  const key = await loadOrCreateExternalPayerPrivateKey(
    input.keyFile,
    offline,
    input.mode === "dry-run",
  );
  try {
    active(input.signal);
    const privateKey = key.toString("base64");
    const publicKey = getPublicKeyFromPrivate(privateKey);
    const fingerprint = await offline.keys.fingerprint(publicKey);
    if (!FINGERPRINT_PATTERN.test(fingerprint)) {
      throw new Error("external payer fingerprint is invalid");
    }
    if (input.mode === "live" && input.expectedFingerprint !== fingerprint) {
      throw new Error("external payer fingerprint does not match approval");
    }
    if (input.mode === "live") {
      await requireExternalPayerNotSubmitted(input.keyFile);
    }
    const creation = dependencies.createExternalParty(publicKey, {
      partyHint: input.partyHint,
      synchronizerId: input.synchronizerId,
    });
    let candidateTopology: ExternalPartyTopology;
    try {
      candidateTopology = await creation.topology();
    } catch {
      throw new Error("external payer topology acquisition failed");
    }
    const topology = canonicalTopology(candidateTopology, fingerprint);
    active(input.signal);
    const recomputed = await offline.utils.hash.topologyTransaction([
      ...topology.topologyTransactions,
    ]);
    if (recomputed !== topology.multiHash) {
      throw new Error("external payer topology hash mismatch");
    }
    const signature = signTransactionHash(recomputed, privateKey);
    active(input.signal);
    let mutationSubmitted = false;
    if (input.mode === "live") {
      await markExternalPayerExecutionStarted(input.keyFile, {
        fingerprint,
        partyId: topology.partyId,
        synchronizerId: input.synchronizerId,
        topologyHash: topology.multiHash,
      });
      active(input.signal);
      let completed: ExternalPartyTopology;
      try {
        completed = canonicalTopology(
          await creation.execute(signature, { grantUserRights: false }),
          fingerprint,
        );
      } catch {
        throw new Error("external payer execution outcome is uncertain");
      }
      if (
        completed.partyId !== topology.partyId ||
        completed.multiHash !== topology.multiHash ||
        JSON.stringify(completed.topologyTransactions) !==
          JSON.stringify(topology.topologyTransactions)
      ) {
        throw new Error("external payer execution outcome is uncertain");
      }
      mutationSubmitted = true;
    }
    return Object.freeze({
      fingerprint: fingerprint as `1220${string}`,
      mode: input.mode,
      mutationSubmitted,
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
