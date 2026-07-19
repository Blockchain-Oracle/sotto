import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiDependencies } from "./dependencies.js";
import { registerAddApiRoutes } from "./routes/add-api.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerComposeAssistRoutes } from "./routes/compose-assist.js";
import { registerComposerRoutes } from "./routes/composer.js";
import { registerOpsRoutes } from "./routes/ops.js";
import { registerPurchaseEventRoutes } from "./routes/purchase-events.js";
import { registerScanRoutes } from "./routes/scan.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerStatsRoutes } from "./routes/stats.js";

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The one web-api process (Q-006): a Fastify composition root over
 * injected seams — no I/O happens at import time and none at build time
 * beyond plugin registration. CORS admits exactly the configured product
 * origin with credentials; everything else is same-origin only.
 */
export async function buildServer(
  deps: ApiDependencies,
): Promise<FastifyInstance> {
  const server = Fastify({ bodyLimit: MAX_BODY_BYTES, logger: false });
  await server.register(fastifyCookie, { secret: deps.sessionSecret });
  await server.register(fastifyCors, {
    origin: [deps.publicAppOrigin],
    credentials: true,
    exposedHeaders: [],
  });

  registerSessionRoutes(server, deps);
  registerCatalogRoutes(server, deps);
  registerAddApiRoutes(server, deps);
  registerComposerRoutes(server, deps);
  registerPurchaseEventRoutes(server, deps);
  registerScanRoutes(server, deps);
  registerStatsRoutes(server, deps);
  registerOpsRoutes(server, deps);
  registerComposeAssistRoutes(server, deps);

  server.get("/healthz", async () => ({
    service: "sotto-api",
    sourceCommit: deps.sourceCommit,
    fiveNorth: deps.fiveNorthConfigured ? "configured" : "unavailable",
  }));

  return server;
}
