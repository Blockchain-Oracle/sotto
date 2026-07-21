import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import { externalPayerTapJournalPath } from "@sotto/capability-wallet";
import type { SignerContext } from "./context.js";
import type { WalletRecord } from "./wallets.js";
import { WALLET_RECORD_VERSION } from "./wallets.js";

const OWNER_HINT = /^[\x20-\x7e]{1,64}$/u;
// Bounded under the API's signer timeout (and a fronting proxy's ~100s limit):
// a failing Five North party allocation must abort and answer, not retry for
// minutes until the proxy returns a bare 502 to the browser.
const ONBOARD_TIMEOUT_MS = 50_000;

function fail(reply: FastifyReply, statusCode: number, error: string): null {
  void reply.status(statusCode).send({ error });
  return null;
}

function partyHintFor(ownerHint: string, walletId: string): string {
  const slug = ownerHint
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 20)
    .replaceAll(/^-+|-+$/gu, "");
  return `sotto-${slug === "" ? "wallet" : slug}-${walletId.slice(0, 8)}`;
}

async function readTapJournal(
  keyFile: string,
): Promise<Readonly<{ amount: string; submissionId: string }> | undefined> {
  let raw: string;
  try {
    raw = await readFile(externalPayerTapJournalPath(keyFile), "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    if (code === "ENOENT") return undefined;
    throw error;
  }
  const record = JSON.parse(raw) as Record<string, unknown>;
  if (
    typeof record.amount !== "string" ||
    typeof record.submissionId !== "string"
  ) {
    throw new Error("signer tap journal is invalid");
  }
  return { amount: record.amount, submissionId: record.submissionId };
}

export function registerOnboardingRoutes(
  server: FastifyInstance,
  context: SignerContext,
): void {
  server.post("/internal/wallets", async (request, reply) => {
    if (context.fiveNorth === undefined) {
      return fail(reply, 503, "five-north-unavailable");
    }
    const body = request.body as Record<string, unknown> | null;
    const ownerHint =
      typeof body === "object" && body !== null ? body.ownerHint : undefined;
    if (typeof ownerHint !== "string" || !OWNER_HINT.test(ownerHint)) {
      return fail(reply, 400, "owner-hint-invalid");
    }
    const created = await context.keystore.createWalletKey();
    const partyHint = partyHintFor(ownerHint, created.walletId);
    const startedAt = new Date(context.now()).toISOString();
    const base: WalletRecord = Object.freeze({
      version: WALLET_RECORD_VERSION,
      walletId: created.walletId,
      ownerHint,
      fingerprint: created.identity.fingerprint,
      partyHint,
      state: "onboarding-started",
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    // Persisted before the live call: party creation is not retry-idempotent.
    await context.wallets.write(base);
    let partyId: string;
    try {
      const result = await context.fiveNorth.onboard({
        expectedFingerprint: created.identity.fingerprint,
        keyFile: context.keystore.keyFilePath(created.walletId),
        partyHint,
        signal: AbortSignal.timeout(ONBOARD_TIMEOUT_MS),
      });
      partyId = result.partyId;
      await context.wallets.write({
        ...base,
        state: "onboarded",
        partyId,
        synchronizerId: result.synchronizerId,
        updatedAt: new Date(context.now()).toISOString(),
      });
    } catch {
      await context.wallets.write({
        ...base,
        state: "onboarding-uncertain",
        updatedAt: new Date(context.now()).toISOString(),
      });
      return fail(reply, 502, "five-north-onboarding-failed");
    }
    return reply.status(201).send({
      fingerprint: created.identity.fingerprint,
      partyId,
      walletId: created.walletId,
    });
  });

  server.post("/internal/wallets/:walletId/fund", async (request, reply) => {
    if (context.fiveNorth === undefined) {
      return fail(reply, 503, "five-north-unavailable");
    }
    const { walletId } = request.params as Readonly<{ walletId: string }>;
    const wallet = await context.wallets.read(walletId);
    if (wallet === undefined) return fail(reply, 404, "wallet-unknown");
    if (wallet.state !== "onboarded" || wallet.partyId === undefined) {
      return fail(reply, 409, "wallet-not-onboarded");
    }
    const keyFile = context.keystore.keyFilePath(walletId);
    const journal = await readTapJournal(keyFile);
    if (journal !== undefined) {
      if (wallet.funding === undefined) {
        await context.wallets.write({
          ...wallet,
          funding: {
            amount: journal.amount,
            state: "tap-submitted",
            submissionId: journal.submissionId,
          },
          updatedAt: new Date(context.now()).toISOString(),
        });
      }
      return reply.send({
        alreadyFunded: true,
        balance: {
          amount: wallet.funding?.amount ?? journal.amount,
          asset: "CC",
          source: "tap-journal",
        },
      });
    }
    try {
      const result = await context.fiveNorth.tap({
        expectedFingerprint: wallet.fingerprint,
        keyFile,
        payerParty: wallet.partyId,
        signal: AbortSignal.timeout(ONBOARD_TIMEOUT_MS),
      });
      await context.wallets.write({
        ...wallet,
        funding: {
          amount: result.amount,
          state: "funded",
          submissionId: result.submissionId,
          updateId: result.updateId,
        },
        updatedAt: new Date(context.now()).toISOString(),
      });
      return reply.send({ amount: result.amount, updateId: result.updateId });
    } catch {
      return fail(reply, 502, "five-north-tap-failed");
    }
  });
}
