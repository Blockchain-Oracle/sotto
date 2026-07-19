import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createCatalogProbe } from "@sotto/catalog-probe";
import type { CatalogRepository, ProbeObservationInput } from "@sotto/database";

const ROUTE_TEMPLATE = /^\/[\x21-\x7e]{0,2047}$/u;
const NAME = /^[\x20-\x7e]{1,128}$/u;

export type ProbeRequest = Readonly<{
  originId: string;
  routeTemplate: string;
  name: string;
  description: string;
  signal?: AbortSignal;
}>;

export type ProbeOutcome = Readonly<{
  status: number;
  body: Readonly<Record<string, unknown>>;
}>;

export type ProbeService = Readonly<{
  probe(request: ProbeRequest): Promise<ProbeOutcome>;
}>;

function fail(status: number, error: string, detail: string): ProbeOutcome {
  return Object.freeze({ status, body: Object.freeze({ error, detail }) });
}

/**
 * Server-side live probe for Add API. Every acquisition is a real
 * cert-pinned HTTPS request from this process to the provider origin —
 * it needs outbound HTTPS only, never DevNet — and every response lands
 * as committed health (and, for a verified x402 challenge, a probe
 * observation with a fresh resource revision). Nothing is fabricated on
 * failure; the failure domain is recorded and returned.
 */
export function createProbeService(
  pool: Pool,
  repository: CatalogRepository,
): ProbeService {
  const probe = createCatalogProbe({
    expectedNetwork: "canton:devnet",
    store: repository,
  });

  async function resourceIdFor(
    originId: string,
    routeTemplate: string,
  ): Promise<string> {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM sotto.resources
       WHERE origin_id = $1 AND http_method = 'GET' AND route_template = $2`,
      [originId, routeTemplate],
    );
    return existing.rows[0]?.id ?? randomUUID();
  }

  return Object.freeze({
    probe: async (request) => {
      if (!ROUTE_TEMPLATE.test(request.routeTemplate)) {
        return fail(
          400,
          "route-template-invalid",
          "The route template must be an absolute path. Provide the exact " +
            "route to probe.",
        );
      }
      if (!NAME.test(request.name)) {
        return fail(
          400,
          "resource-name-invalid",
          "Provide a printable resource name up to 128 characters.",
        );
      }
      const origin = await repository.findProviderOriginById(request.originId);
      if (origin === null) {
        return fail(
          404,
          "origin-unknown",
          "This origin is not registered. Register the origin, then probe.",
        );
      }
      const acquisition = await probe.acquireAndRecord(
        {
          description: request.description,
          method: "GET",
          name: request.name,
          observationId: randomUUID(),
          originId: origin.originId,
          resourceId: await resourceIdFor(
            origin.originId,
            request.routeTemplate,
          ),
          revisionId: randomUUID(),
          routeTemplate: request.routeTemplate,
        },
        request.signal === undefined ? {} : { signal: request.signal },
      );
      if (acquisition.outcome === "failed") {
        return Object.freeze({
          status: 422,
          body: Object.freeze({
            error: "probe-not-x402",
            detail:
              "The live probe did not observe a valid Canton x402 payment " +
              "challenge at this route. Fix the endpoint, then probe again.",
            health: acquisition.health,
          }),
        });
      }
      const observation: ProbeObservationInput = acquisition.observation;
      await repository.recordProbeObservation(observation);
      return Object.freeze({
        status: 201,
        body: Object.freeze({
          observation,
          health: acquisition.health,
        }),
      });
    },
  });
}
