import type {
  PersistedProbeHealth,
  ProbeObservationInput,
} from "@sotto/database";
import { vi } from "vitest";
import type { CatalogProbeInput, CatalogProbeStore } from "../src/index.js";

export const ORIGIN_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96003";
export const RESOURCE_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96005";
export const REVISION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96006";
export const OBSERVATION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96007";
export const RESOURCE_URL = "https://weather.example.com/weather/current";

export function catalogProbeInput(): CatalogProbeInput {
  return {
    observationId: OBSERVATION_ID,
    originId: ORIGIN_ID,
    resourceId: RESOURCE_ID,
    revisionId: REVISION_ID,
    method: "GET",
    routeTemplate: "/weather/current",
    name: "Current weather",
    description: "Return current weather for one location.",
  };
}

export function catalogPaymentChallenge() {
  return {
    x402Version: 2,
    resource: { url: RESOURCE_URL },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: "2500000000",
        asset: "CC",
        payTo: "sotto-weather-provider::1220provider",
        maxTimeoutSeconds: 60,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 45,
          feePayer: "sotto-payer::1220payer",
          instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
          synchronizerId: "global-domain::1220sync",
        },
      },
    ],
  };
}

export function catalogProbeResponse(
  status = 402,
  challenge: unknown = catalogPaymentChallenge(),
): Response {
  return new Response(null, {
    headers:
      status === 402
        ? {
            "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
              "base64",
            ),
          }
        : {},
    status,
  });
}

export function catalogProbeStore(origin = "https://weather.example.com") {
  const recordProbeObservation = vi.fn(async (input: ProbeObservationInput) => {
    void input;
    return {
      id: OBSERVATION_ID,
      outcome: "created" as const,
    };
  });
  const findProviderOriginById = vi.fn(async () =>
    origin === ""
      ? null
      : {
          originId: ORIGIN_ID,
          normalizedOrigin: origin,
        },
  );
  const findProbeHealthById = vi.fn(
    async (): Promise<PersistedProbeHealth | null> => null,
  );
  const recordProbeHealth = vi.fn(async ({ health }) => ({
    id: health.healthObservationId,
    outcome: "created" as const,
  }));
  const recordHealthObservation = vi.fn(async (health) => ({
    id: health.healthObservationId,
    outcome: "created" as const,
  }));
  return {
    api: {
      findProbeHealthById,
      findProviderOriginById,
      recordHealthObservation,
      recordProbeHealth,
    } as CatalogProbeStore,
    findProbeHealthById,
    findProviderOriginById,
    recordHealthObservation,
    recordProbeHealth,
    recordProbeObservation,
  };
}
