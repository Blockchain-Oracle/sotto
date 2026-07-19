import { createHash, timingSafeEqual } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { recomputeReferenceWalletPreparedHash } from "@sotto/canton-client";
import { signReferenceWalletPreparedHash } from "@sotto/capability-wallet";
import { registerApprovalPageRoutes } from "./approval-page.js";
import { createApprovalStore } from "./approval-store.js";
import { registerApprovalRoutes } from "./approvals.js";
import type {
  RecomputePreparedHash,
  SignPreparedHash,
  SignerContext,
} from "./context.js";
import type { SignerEnvironment } from "./env.js";
import {
  createLiveFiveNorthRunner,
  type FiveNorthRunner,
} from "./five-north.js";
import { createSignerKeystore } from "./keystore.js";
import { registerOnboardingRoutes } from "./onboarding.js";
import { registerWalletSessionRoutes } from "./wallet-session.js";
import { createWalletDirectory } from "./wallets.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type SignerServerOptions = Readonly<{
  env: SignerEnvironment;
  fiveNorth?: FiveNorthRunner;
  now?: () => number;
  recomputePreparedHash?: RecomputePreparedHash;
  signPreparedHash?: SignPreparedHash;
}>;

function digestOf(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function bearerTokenMatches(
  header: string | undefined,
  serviceToken: string,
): boolean {
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  return timingSafeEqual(
    digestOf(header.slice("Bearer ".length)),
    digestOf(serviceToken),
  );
}

export async function createSignerServer(
  options: SignerServerOptions,
): Promise<FastifyInstance> {
  const env = options.env;
  const now = options.now ?? Date.now;
  const context: SignerContext = Object.freeze({
    approvals: await createApprovalStore(env.keyDirectory, now),
    env,
    fiveNorth:
      options.fiveNorth ??
      (env.fiveNorth === undefined
        ? undefined
        : createLiveFiveNorthRunner(env.fiveNorth)),
    keystore: await createSignerKeystore(env.keyDirectory),
    now,
    recomputePreparedHash:
      options.recomputePreparedHash ?? recomputeReferenceWalletPreparedHash,
    signPreparedHash:
      options.signPreparedHash ??
      ((keyFile, hash, fingerprint) =>
        signReferenceWalletPreparedHash(keyFile, hash, fingerprint)),
    wallets: await createWalletDirectory(env.keyDirectory),
  });

  const server = Fastify({ bodyLimit: MAX_BODY_BYTES, logger: false });
  await server.register(fastifyCookie, { secret: env.walletSessionSecret });

  // The wallet approval forms post without a payload; the parser accepts the
  // content type and intentionally discards any body.
  server.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "buffer" },
    (_request, _body, done) => {
      done(null, {});
    },
  );

  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/internal/")) return;
    if (!bearerTokenMatches(request.headers.authorization, env.serviceToken)) {
      await reply.status(401).send({ error: "service-token-required" });
    }
  });

  registerApprovalRoutes(server, context);
  registerOnboardingRoutes(server, context);
  await registerWalletSessionRoutes(server, context);
  registerApprovalPageRoutes(server, context);

  server.get("/healthz", async () => ({
    fiveNorth: context.fiveNorth === undefined ? "unavailable" : "configured",
    service: "sotto-signer",
  }));

  return server;
}
