import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { readSignerEnvironment, type SignerEnvironment } from "../src/env.js";
import { createSignerKeystore } from "../src/keystore.js";
import { createSignerServer, type SignerServerOptions } from "../src/server.js";
import {
  createWalletDirectory,
  WALLET_RECORD_VERSION,
} from "../src/wallets.js";

export const SERVICE_TOKEN = "service-token-0123456789abcdef0123456789";
export const SESSION_SECRET = "session-secret-0123456789abcdef012345678";
export const WALLET_ORIGIN = "http://127.0.0.1:4402";

export function temporaryKeyDirectory(): string {
  return mkdtempSync(join(tmpdir(), "sotto-signer-test-"));
}

export function environmentSource(
  keyDirectory: string,
): Record<string, string> {
  return {
    PUBLIC_WALLET_ORIGIN: WALLET_ORIGIN,
    SIGNER_KEY_DIR: keyDirectory,
    SIGNER_SERVICE_TOKEN: SERVICE_TOKEN,
    WALLET_SESSION_SECRET: SESSION_SECRET,
  };
}

export function testEnvironment(keyDirectory: string): SignerEnvironment {
  return readSignerEnvironment(environmentSource(keyDirectory));
}

export function sha256PreparedFake(): {
  hashFor: (bytes: Uint8Array) => `sha256:${string}`;
  recompute: (bytes: Uint8Array) => Promise<Uint8Array>;
} {
  const digest = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest();
  return {
    hashFor: (bytes) => `sha256:${digest(bytes).toString("hex")}`,
    recompute: (bytes) => Promise.resolve(new Uint8Array(digest(bytes))),
  };
}

export async function buildServer(
  keyDirectory: string,
  options: Omit<SignerServerOptions, "env"> = {},
): Promise<FastifyInstance> {
  return createSignerServer({ env: testEnvironment(keyDirectory), ...options });
}

export async function provisionWallet(
  keyDirectory: string,
  withParty = true,
): Promise<
  Readonly<{ fingerprint: `1220${string}`; partyId: string; walletId: string }>
> {
  const keystore = await createSignerKeystore(keyDirectory);
  const wallets = await createWalletDirectory(keyDirectory);
  const created = await keystore.createWalletKey();
  const partyId = `sotto-test::${created.identity.fingerprint}`;
  const at = new Date().toISOString();
  await wallets.write({
    version: WALLET_RECORD_VERSION,
    walletId: created.walletId,
    ownerHint: "judge wallet",
    fingerprint: created.identity.fingerprint,
    partyHint: `sotto-judge-${created.walletId.slice(0, 8)}`,
    state: withParty ? "onboarded" : "created",
    ...(withParty ? { partyId, synchronizerId: "sync::test" } : {}),
    createdAt: at,
    updatedAt: at,
  });
  return Object.freeze({
    fingerprint: created.identity.fingerprint,
    partyId,
    walletId: created.walletId,
  });
}

export function hash(seed: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(seed, "utf8").digest("hex")}`;
}

export function approvalSummaryFor(input: {
  executeBefore?: string;
  fingerprint: `1220${string}`;
  partyId: string;
  preparedTransactionHash: `sha256:${string}`;
  requestCommitment?: `sha256:${string}`;
}): Record<string, unknown> {
  return {
    action: "pay-for-api-call",
    amountAtomic: "12500000000",
    asset: "CC",
    attemptId: hash("attempt"),
    authorizationMode: "human-wallet",
    bodyHash: hash("body"),
    challengeId: hash("challenge"),
    executeBefore:
      input.executeBefore ?? new Date(Date.now() + 3_600_000).toISOString(),
    instrument: { admin: "dso::admin-party", id: "Amulet" },
    maximumFeeAtomic: "300000000",
    maximumTotalDebitAtomic: "12800000000",
    method: "POST",
    network: "canton:five-north-devnet",
    payerParty: input.partyId,
    preparedTransactionHash: input.preparedTransactionHash,
    providerParty: "merchant::provider-party",
    purchaseCommitment: hash("purchase"),
    queryPresent: false,
    requestCommitment: input.requestCommitment ?? hash("request"),
    resourceOrigin: "https://api.example.com",
    resourcePath: "/v1/answers",
    selectedPackage: {
      packageId: createHash("sha256").update("package").digest("hex"),
      packageName: "splice-amulet",
      packageVersion: "0.1.14",
    },
    signer: {
      publicKeyFingerprint: input.fingerprint,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
    },
    synchronizerId: "sync::test",
    tokenFactory: {
      contractId: "00f00d",
      expectedAdmin: "dso::admin-party",
    },
    transferContextHash: hash("transfer-context"),
    version: "sotto-human-purchase-approval-v2",
  };
}

export function preparedTransactionFixture(): {
  encoded: string;
  hash: `sha256:${string}`;
  recompute: (bytes: Uint8Array) => Promise<Uint8Array>;
} {
  const fake = sha256PreparedFake();
  const bytes = randomBytes(96);
  return {
    encoded: bytes.toString("base64"),
    hash: fake.hashFor(bytes),
    recompute: fake.recompute,
  };
}

export function bearer(): Record<string, string> {
  return { authorization: `Bearer ${SERVICE_TOKEN}` };
}

export function sessionCookieFor(setCookieHeader: string): string {
  const first = setCookieHeader.split(";")[0];
  if (first === undefined) throw new Error("missing session cookie");
  return first;
}
