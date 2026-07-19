import {
  SottoApiError,
  pairedOutcome,
  type SottoClient,
} from "@sotto/purchase-client";
import { filterResources, parseMaxPrice, resolveResource } from "../core.js";

export type ToolDefinition = Readonly<{
  name: string;
  title: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  annotations: Readonly<Record<string, unknown>>;
}>;

export type ToolResult = Readonly<{
  content: readonly Readonly<{ type: "text"; text: string }>[];
  isError?: boolean;
}>;

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const failure = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = Object.freeze([
  {
    name: "search_resources",
    title: "Search verified Canton x402 resources",
    description:
      "Search Sotto's verified catalog. Read-only; an empty catalog answers " +
      "an honest empty list, never samples.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text filter" },
        method: { type: "string", description: "HTTP method filter" },
        maxPriceAtomic: {
          type: "string",
          description: "Upper price bound in atomic units",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "inspect_resource",
    title: "Inspect one verified resource",
    description:
      "Fetch one resource by listing ID or canonical URL: method, route, " +
      "fresh server-observed price with its timestamp, recipient, and the " +
      "latest health observation. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description: "Listing ID or canonical resource URL",
        },
      },
      required: ["resource"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "purchase",
    title: "Purchase (moves real money after human wallet approval)",
    description:
      "Initiate ONE exact purchase of a verified resource. This journals a " +
      "real payment intent; a HUMAN must approve the prepared call at the " +
      "Sotto wallet before any value moves. This tool cannot sign, has no " +
      "key, and never retries. Ask the human before calling it.",
    inputSchema: {
      type: "object",
      properties: {
        listingId: { type: "string", description: "Verified listing ID" },
        maxPriceAtomic: {
          type: "string",
          description:
            "Local policy bound (atomic units) — refused client-side, not a " +
            "ledger-enforced limit",
        },
      },
      required: ["listingId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "purchase_status",
    title: "Read a purchase's full journal state",
    description:
      "Full lifecycle for one attempt: journal events, settlement and " +
      "delivery as separate facts, including the honest settled-undelivered " +
      "case with reconcile guidance. Read-only.",
    inputSchema: {
      type: "object",
      properties: { attemptId: { type: "string" } },
      required: ["attemptId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_evidence",
    title: "Read attempt evidence",
    description:
      "Paired settlement/delivery outcome, source-labeled timeline, update " +
      "ID, and public explorer URL when indexed. Read-only.",
    inputSchema: {
      type: "object",
      properties: { attemptId: { type: "string" } },
      required: ["attemptId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
] as const);

/** Executes one tool call against the shared purchasing core. */
export async function callTool(
  client: SottoClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_resources": {
        const maxPrice = parseMaxPrice(str(args.maxPriceAtomic));
        const query = str(args.query);
        const method = str(args.method);
        const resources = filterResources(
          await client.catalog.listResources(),
          {
            ...(query === undefined ? {} : { query }),
            ...(method === undefined ? {} : { method }),
            ...(maxPrice === undefined ? {} : { maxPriceAtomic: maxPrice }),
          },
        );
        return text({ resources });
      }
      case "inspect_resource": {
        const reference = str(args.resource);
        if (reference === undefined) return failure("resource is required");
        const resource = await resolveResource(client, reference);
        const health = await client.catalog.resourceHealth(resource.listingId);
        return text({ resource, health });
      }
      case "purchase": {
        const listingId = str(args.listingId);
        if (listingId === undefined) return failure("listingId is required");
        const maxPrice = parseMaxPrice(str(args.maxPriceAtomic));
        if (maxPrice !== undefined) {
          const resource = await client.catalog.resourceByListing(listingId);
          if (BigInt(resource.amountAtomic) > maxPrice) {
            return failure(
              `local-policy-stop: the indexed price ${resource.amountAtomic} ` +
                `${resource.asset} (atomic) exceeds maxPriceAtomic ` +
                `${maxPrice}. Nothing was initiated. This is local policy, ` +
                "not a ledger-enforced limit. Report the block to the human " +
                "instead of seeking another transfer path.",
            );
          }
        }
        const initiated = await client.purchases.initiate(listingId);
        return text({
          ...initiated,
          humanApproval:
            "A HUMAN must approve this exact prepared call at the Sotto " +
            "wallet before any value moves. This tool cannot sign and will " +
            "not retry. Follow progress with purchase_status.",
        });
      }
      case "purchase_status": {
        const attemptId = str(args.attemptId);
        if (attemptId === undefined) return failure("attemptId is required");
        const detail = await client.purchases.get(attemptId);
        const outcome = pairedOutcome(
          detail.attempt.state,
          detail.delivery?.claimState ?? null,
        );
        return text({
          ...detail,
          pairedOutcome: outcome,
          ...(outcome.deliveryPending || outcome.deliveryFailed
            ? {
                reconcileGuidance:
                  "Settled but not delivered. Do NOT purchase again — a " +
                  "second attempt can pay twice. Reconcile with get_evidence " +
                  "and report the state to the human.",
              }
            : {}),
        });
      }
      case "get_evidence": {
        const attemptId = str(args.attemptId);
        if (attemptId === undefined) return failure("attemptId is required");
        return text({ attempt: await client.attempts.evidence(attemptId) });
      }
      default:
        return failure(`unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof SottoApiError) {
      return failure(`${error.code}: ${error.detail ?? "no detail"}`);
    }
    return failure(error instanceof Error ? error.message : String(error));
  }
}
