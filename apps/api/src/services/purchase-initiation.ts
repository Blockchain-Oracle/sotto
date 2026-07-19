import {
  inspectCatalogPaymentRequiredResponse,
  type CatalogPaymentRequiredInspection,
} from "@sotto/x402-canton";
import type { HumanPurchaseAttemptResult } from "@sotto/database";
import type { HumanPurchaseLedgerIntent } from "@sotto/x402-canton";
import type { CatalogReads } from "./catalog-reads.js";
import type { IntentAssembler } from "./intent-assembly.js";
import { PayerProfileUnavailableError } from "./intent-assembly.js";
import type { PurchaseBindingRegistry } from "./purchase-binding.js";

const FETCH_TIMEOUT_MS = 20_000;

export type Live402Fetcher = (
  url: string,
  signal: AbortSignal,
) => Promise<Response>;

export type PurchaseInitializer = Readonly<{
  initializeHumanPurchaseAttempt(
    intent: HumanPurchaseLedgerIntent,
  ): Promise<HumanPurchaseAttemptResult>;
}>;

export type InitiationOutcome = Readonly<{
  status: number;
  body: Readonly<Record<string, unknown>>;
}>;

export type PurchaseInitiationInput = Readonly<{
  listingId: string;
  session: Readonly<{ ownerId: string; partyId: string }>;
  signal: AbortSignal;
}>;

export type PurchaseInitiation = Readonly<{
  initiate(input: PurchaseInitiationInput): Promise<InitiationOutcome>;
}>;

export type PurchaseInitiationDependencies = Readonly<{
  catalog: CatalogReads;
  fetch402?: Live402Fetcher;
  assembler: IntentAssembler | undefined;
  binding: PurchaseBindingRegistry;
  repository: PurchaseInitializer;
}>;

function outcome(
  status: number,
  body: Readonly<Record<string, unknown>>,
): InitiationOutcome {
  return Object.freeze({ status, body: Object.freeze(body) });
}

async function defaultFetch402(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
  });
}

function priceFacts(
  indexed: Readonly<{ amountAtomic: string; recipient: string }>,
  observed: CatalogPaymentRequiredInspection,
) {
  return Object.freeze({
    indexed: Object.freeze({
      amountAtomic: indexed.amountAtomic,
      recipient: indexed.recipient,
    }),
    observed: Object.freeze({
      amountAtomic: observed.amountAtomic,
      recipient: observed.recipient,
      observedAt: observed.observedAt,
    }),
    changed:
      indexed.amountAtomic !== observed.amountAtomic ||
      indexed.recipient !== observed.recipient,
  });
}

/**
 * Composer purchase initiation. One real fetch of the canonical resource
 * URL observes the live 402 challenge; a changed price or recipient stops
 * the flow with both facts instead of silently paying the new price. The
 * assembled ledger intent journals through
 * `initializeHumanPurchaseAttempt` and the worker owns everything after
 * the committed intent-created row.
 */
export function createPurchaseInitiation(
  dependencies: PurchaseInitiationDependencies,
): PurchaseInitiation {
  const fetch402 = dependencies.fetch402 ?? defaultFetch402;
  return Object.freeze({
    initiate: async ({ listingId, session, signal }) => {
      const resource = await dependencies.catalog.resourceByListing(listingId);
      if (resource === null) {
        return outcome(404, {
          error: "resource-unknown",
          detail:
            "No published resource matches this listing. Refresh the " +
            "catalog and select a verified resource.",
        });
      }
      if (resource.routeTemplate.includes("{")) {
        return outcome(422, {
          error: "route-parameters-unsupported",
          detail:
            "This resource's route template carries parameters, which the " +
            "Composer cannot bind yet. Choose a parameterless resource.",
        });
      }
      const url = `${resource.normalizedOrigin}${resource.routeTemplate}`;
      let response: Response;
      try {
        response = await fetch402(url, signal);
      } catch {
        return outcome(502, {
          error: "provider-unreachable",
          detail:
            "The provider origin did not answer the live payment-challenge " +
            "fetch. Retry once the provider is reachable.",
        });
      }
      let inspection: CatalogPaymentRequiredInspection;
      try {
        inspection = inspectCatalogPaymentRequiredResponse(response, {
          expectedNetwork: resource.network as `canton:${string}`,
          expectedResourceUrl: url,
        });
      } catch (error) {
        return outcome(502, {
          error: "challenge-invalid",
          detail:
            "The provider's live response is not a valid Canton x402 " +
            "payment challenge. Re-probe the resource before purchasing. " +
            `(${error instanceof Error ? error.message : "unknown"})`,
        });
      }
      const price = priceFacts(resource, inspection);
      if (price.changed) {
        return outcome(409, {
          error: "price-changed",
          detail:
            "The live challenge differs from the indexed price. Review the " +
            "server-observed price, then re-probe or retry deliberately.",
          price,
        });
      }
      if (dependencies.assembler === undefined) {
        return outcome(503, {
          error: "five-north-unavailable",
          detail:
            "Purchase initiation needs the Five North DevNet configuration, " +
            "which this deployment does not carry. Configure FIVE_NORTH_* " +
            "and retry.",
        });
      }
      try {
        const assembled = await dependencies.assembler({
          request: { method: resource.method, url },
          response402: response,
          providerParty: inspection.recipient,
          partyId: session.partyId,
          signal,
        });
        dependencies.binding.register(assembled.intent.attemptId, {
          ownerId: session.ownerId,
          resourceRevisionId: resource.resourceRevisionId,
          beginExclusive: assembled.beginExclusive,
          resource: {
            method: assembled.intent.request.method,
            origin: assembled.intent.request.resourceOrigin,
            path: assembled.intent.request.resourcePath,
          },
        });
        const result =
          await dependencies.repository.initializeHumanPurchaseAttempt(
            assembled.intent,
          );
        return outcome(result.outcome === "created" ? 201 : 200, {
          attemptId: result.attemptId,
          outcome: result.outcome,
          state: result.state,
          commandId: result.commandId,
          executeBefore: assembled.intent.challenge.executeBefore,
          price,
        });
      } catch (error) {
        if (error instanceof PayerProfileUnavailableError) {
          return outcome(503, {
            error: "payer-profile-unavailable",
            detail: error.message,
          });
        }
        return outcome(502, {
          error: "purchase-initiation-failed",
          detail:
            "Assembling the authenticated purchase intent against Five " +
            "North failed; nothing was journaled. Retry once DevNet " +
            `answers. (${error instanceof Error ? error.message : "unknown"})`,
        });
      }
    },
  });
}
