import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  externalPayerJournalPath,
  readReferenceWalletPublicIdentity,
} from "@sotto/capability-wallet";
import type { SignerContext } from "./context.js";
import type { WalletRecord } from "./wallets.js";

const MAX_JOURNAL_BYTES = 4_096;
const JOURNAL_SCHEMA = "sotto-external-payer-onboarding-v1";

type OnboardingFacts = Readonly<{
  partyId: string;
  synchronizerId: string;
  topologyHash: string;
}>;

async function readOnboardingFacts(
  keyFile: string,
): Promise<OnboardingFacts | undefined> {
  let raw: string;
  try {
    raw = await readFile(externalPayerJournalPath(keyFile), "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    if (code === "ENOENT") return undefined;
    throw error;
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_JOURNAL_BYTES) {
    throw new Error("signer onboarding journal exceeds its byte boundary");
  }
  const record = JSON.parse(raw) as Record<string, unknown>;
  if (
    record.schema !== JOURNAL_SCHEMA ||
    typeof record.partyId !== "string" ||
    typeof record.synchronizerId !== "string" ||
    typeof record.topologyHash !== "string"
  ) {
    throw new Error("signer onboarding journal is invalid");
  }
  return Object.freeze({
    partyId: record.partyId,
    synchronizerId: record.synchronizerId,
    topologyHash: record.topologyHash,
  });
}

async function sendProfile(
  reply: FastifyReply,
  context: SignerContext,
  wallet: WalletRecord,
): Promise<unknown> {
  const keyFile = context.keystore.keyFilePath(wallet.walletId);
  const identity = await readReferenceWalletPublicIdentity(keyFile);
  if (identity.fingerprint !== wallet.fingerprint) {
    return reply.status(500).send({ error: "wallet-fingerprint-mismatch" });
  }
  const onboarding = await readOnboardingFacts(keyFile);
  if (
    onboarding !== undefined &&
    wallet.partyId !== undefined &&
    onboarding.partyId !== wallet.partyId
  ) {
    return reply.status(500).send({ error: "wallet-party-mismatch" });
  }
  return reply.send({
    walletId: wallet.walletId,
    ownerHint: wallet.ownerHint,
    state: wallet.state,
    fingerprint: wallet.fingerprint,
    publicKeyBase64: identity.publicKey,
    publicKeyFormat: identity.publicKeyFormat,
    ...(wallet.partyId === undefined ? {} : { partyId: wallet.partyId }),
    ...(onboarding === undefined
      ? {}
      : {
          synchronizerId: onboarding.synchronizerId,
          topologyHash: onboarding.topologyHash,
        }),
  });
}

/**
 * Read-only wallet signing profile for the web api's purchase initiation.
 * Every fact is served from the signer's own durable records — the wallet
 * record, the external-payer onboarding journal written during the real
 * Five North onboarding, and the public half of the key file. The private
 * key never leaves the keystore; only the public key travels.
 */
export function registerProfileRoutes(
  server: FastifyInstance,
  context: SignerContext,
): void {
  server.get("/internal/wallets/:walletId/profile", async (request, reply) => {
    const { walletId } = request.params as Readonly<{ walletId: string }>;
    const wallet = await context.wallets.read(walletId);
    if (wallet === undefined) {
      return reply.status(404).send({ error: "wallet-unknown" });
    }
    return sendProfile(reply, context, wallet);
  });

  server.get(
    "/internal/wallets/by-party/:partyId/profile",
    async (request, reply) => {
      const { partyId } = request.params as Readonly<{ partyId: string }>;
      const wallet = await context.wallets.findByPartyId(partyId);
      if (wallet === undefined) {
        return reply.status(404).send({ error: "wallet-unknown" });
      }
      return sendProfile(reply, context, wallet);
    },
  );
}
