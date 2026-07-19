import type { FastifyInstance } from "fastify";
import type { ApiDependencies } from "../dependencies.js";
import { requireSession } from "../auth/session.js";

/**
 * Composer assistant, env-gated on OPENROUTER_API_KEY. The model receives
 * public catalog facts and the task text only — never keys, session
 * tokens, or URLs to call — and its output must conform to the derived
 * input schema or the route answers 422.
 */
export function registerComposeAssistRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  server.post(
    "/v1/compose-assist",
    { preHandler: requireSession(deps.sessions) },
    async (request, reply) => {
      if (deps.composeAssist === undefined) {
        return reply.status(503).send({
          error: "compose-assist-unavailable",
          detail:
            "No OPENROUTER_API_KEY is configured, so the assistant is off. " +
            "Compose the request input by hand.",
        });
      }
      const payload =
        typeof request.body === "object" &&
        request.body !== null &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, unknown>)
          : {};
      const { listingId, task } = payload;
      if (typeof listingId !== "string" || typeof task !== "string") {
        return reply.status(400).send({
          error: "compose-request-invalid",
          detail: "Provide listingId and a task description.",
        });
      }
      const resource = await deps.catalog.resourceByListing(listingId);
      if (resource === null) {
        return reply.status(404).send({
          error: "resource-unknown",
          detail:
            "No published resource matches this listing. Select a verified " +
            "resource first.",
        });
      }
      const outcome = await deps.composeAssist.compose({
        resource,
        task,
        signal: AbortSignal.timeout(90_000),
      });
      return reply.status(outcome.status).send(outcome.body);
    },
  );
}
