import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  PublicationIneligibleError,
  PublicationStaleError,
} from "@sotto/database";
import type { ApiDependencies } from "../dependencies.js";
import { requireSession, sessionOf } from "../auth/session.js";
import { isUuid } from "../services/catalog-reads.js";

const DISPLAY_NAME = /^[\x20-\x7e]{1,128}$/u;
const DESCRIPTION = /^[\x20-\x7e]{1,512}$/u;

function body(request: { body: unknown }): Record<string, unknown> {
  const value = request.body;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Add API flow, session-required end to end: origin registration, the
 * real server-side probe, the well-known origin-ownership proof, and
 * publication. Compatibility, ownership, and publication remain separate
 * checks; nothing a browser submits is treated as payment authority.
 */
export function registerAddApiRoutes(
  server: FastifyInstance,
  deps: ApiDependencies,
): void {
  const guard = { preHandler: requireSession(deps.sessions) };

  server.post("/v1/origins", guard, async (request, reply) => {
    const session = sessionOf(request);
    const { originUrl, providerDisplayName } = body(request);
    if (
      typeof providerDisplayName !== "string" ||
      !DISPLAY_NAME.test(providerDisplayName)
    ) {
      return reply.status(400).send({
        error: "provider-name-invalid",
        detail: "Provide a printable provider display name.",
      });
    }
    if (typeof originUrl !== "string") {
      return reply.status(400).send({
        error: "origin-url-invalid",
        detail: "Provide the HTTPS origin to register.",
      });
    }
    let parsed: URL;
    try {
      parsed = new URL(originUrl);
    } catch {
      return reply.status(400).send({
        error: "origin-url-invalid",
        detail: "The origin is not a valid URL. Provide an HTTPS origin.",
      });
    }
    if (parsed.protocol !== "https:") {
      return reply.status(400).send({
        error: "origin-url-invalid",
        detail: "Only HTTPS origins can carry paid resources. Use https://.",
      });
    }
    const existing = await deps.catalogRepository.findProviderOrigin(
      parsed.toString(),
    );
    if (existing !== null) {
      if (existing.ownerId !== session.ownerId) {
        return reply.status(409).send({
          error: "origin-owned-elsewhere",
          detail:
            "Another owner already registered this origin. Prove control " +
            "of a different origin, or contact the operator.",
        });
      }
      return reply.status(200).send({ origin: existing, outcome: "replayed" });
    }
    const registered = await deps.catalogRepository.registerProviderOrigin({
      registrationId: randomUUID(),
      ownerId: session.ownerId,
      ownerPartyId: session.partyId,
      providerId: randomUUID(),
      providerDisplayName,
      originId: randomUUID(),
      originUrl: parsed.toString(),
    });
    return reply.status(201).send({
      origin: registered,
      outcome: registered.outcome,
    });
  });

  server.post("/v1/origins/:originId/probe", guard, async (request, reply) => {
    const { originId } = request.params as Readonly<{ originId: string }>;
    const payload = body(request);
    if (!isUuid(originId)) {
      return reply
        .status(404)
        .send({ error: "origin-unknown", detail: "Unknown origin ID." });
    }
    const origin =
      await deps.catalogRepository.findProviderOriginById(originId);
    if (origin === null || origin.ownerId !== sessionOf(request).ownerId) {
      return reply.status(404).send({
        error: "origin-unknown",
        detail: "This origin is not registered to your owner session.",
      });
    }
    const description = payload.description;
    const outcome = await deps.probeService.probe({
      originId,
      routeTemplate:
        typeof payload.routeTemplate === "string" ? payload.routeTemplate : "",
      name: typeof payload.name === "string" ? payload.name : "",
      description:
        typeof description === "string" && DESCRIPTION.test(description)
          ? description
          : "",
    });
    return reply.status(outcome.status).send(outcome.body);
  });

  server.post(
    "/v1/origins/:originId/proof-challenge",
    guard,
    async (request, reply) => {
      const { originId } = request.params as Readonly<{ originId: string }>;
      const method = body(request).method;
      if (method !== undefined && method !== "well-known") {
        return reply.status(501).send({
          error: "not-implemented",
          detail:
            "Only the well-known file proof is verifiable today. DNS-record " +
            "proofs are not implemented; nothing is assumed proven.",
        });
      }
      const outcome = await deps.originProof.issueChallenge({
        originId,
        ownerId: sessionOf(request).ownerId,
      });
      return reply.status(outcome.status).send(outcome.body);
    },
  );

  server.post(
    "/v1/origins/:originId/proof-verify",
    guard,
    async (request, reply) => {
      const { originId } = request.params as Readonly<{ originId: string }>;
      const outcome = await deps.originProof.verifyChallenge({
        originId,
        ownerId: sessionOf(request).ownerId,
        signal: AbortSignal.timeout(30_000),
      });
      return reply.status(outcome.status).send(outcome.body);
    },
  );

  server.post("/v1/resources/publish", guard, async (request, reply) => {
    const payload = body(request);
    const fields = [
      "resourceId",
      "resourceRevisionId",
      "originProofId",
    ] as const;
    for (const field of fields) {
      const value = payload[field];
      if (typeof value !== "string" || !isUuid(value)) {
        return reply.status(400).send({
          error: "publication-request-invalid",
          detail: `Provide ${field} from the probe and proof steps.`,
        });
      }
    }
    const expectedListingVersion = payload.expectedListingVersion ?? 0;
    if (
      typeof expectedListingVersion !== "number" ||
      !Number.isSafeInteger(expectedListingVersion) ||
      expectedListingVersion < 0
    ) {
      return reply.status(400).send({
        error: "publication-request-invalid",
        detail: "expectedListingVersion must be a non-negative integer.",
      });
    }
    try {
      const published = await deps.catalogRepository.publishVerifiedResource({
        publicationId: randomUUID(),
        listingId: randomUUID(),
        ownerId: sessionOf(request).ownerId,
        originProofId: payload.originProofId as string,
        resourceId: payload.resourceId as string,
        resourceRevisionId: payload.resourceRevisionId as string,
        expectedListingVersion,
      });
      return reply.status(201).send({ resource: published });
    } catch (error) {
      if (error instanceof PublicationStaleError) {
        return reply.status(409).send({
          error: "publication-stale",
          detail:
            "The listing moved past the expected version. Reload the " +
            "listing state, then publish against the current version.",
        });
      }
      if (error instanceof PublicationIneligibleError) {
        return reply.status(422).send({
          error: "publication-ineligible",
          detail:
            "Publication needs a current origin-ownership proof and the " +
            "latest verified revision. Re-run the proof or probe, then " +
            "publish again.",
        });
      }
      throw error;
    }
  });
}
