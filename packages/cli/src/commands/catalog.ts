import type { CatalogResource } from "@sotto/purchase-client";
import type { Env } from "../config.js";
import {
  buildClient,
  filterResources,
  parseMaxPrice,
  resolveResource,
  CliUsageError,
} from "../core.js";
import { EXIT, type ExitCode } from "../exit-codes.js";
import {
  amountWithAsset,
  printJson,
  resourceUrl,
  table,
  type Io,
} from "../output.js";
import type { FetchLike } from "@sotto/purchase-client";

export type CatalogCommandInput = Readonly<{
  io: Io;
  env: Env;
  positionals: readonly string[];
  flags: Readonly<Record<string, string | boolean | undefined>>;
  fetchImpl?: FetchLike;
}>;

function apiOriginFlag(
  flags: CatalogCommandInput["flags"],
): Readonly<{ apiOrigin?: string }> {
  return typeof flags["api-origin"] === "string"
    ? { apiOrigin: flags["api-origin"] }
    : {};
}

export async function searchCommand(
  input: CatalogCommandInput,
): Promise<ExitCode> {
  const { io, flags } = input;
  if (flags.tag !== undefined) {
    throw new CliUsageError(
      "The verified catalog carries no tags yet, so --tag cannot filter " +
        "anything. Filter by --method, --max-price, or free text instead.",
    );
  }
  const { client } = buildClient(
    input.env,
    apiOriginFlag(flags),
    input.fetchImpl,
  );
  const maxPrice = parseMaxPrice(
    typeof flags["max-price"] === "string" ? flags["max-price"] : undefined,
  );
  const resources = filterResources(await client.catalog.listResources(), {
    ...(input.positionals[0] === undefined
      ? {}
      : { query: input.positionals[0] }),
    ...(typeof flags.method === "string" ? { method: flags.method } : {}),
    ...(maxPrice === undefined ? {} : { maxPriceAtomic: maxPrice }),
  });
  if (flags.json === true) {
    printJson(io, { resources });
    return EXIT.ok;
  }
  if (resources.length === 0) {
    io.stdout("No verified resources match. The catalog answer is honest —");
    io.stdout("nothing is hidden and nothing is sampled.");
    return EXIT.ok;
  }
  for (const line of table(
    resources.map((resource) => [
      resource.listingId,
      resource.method,
      resourceUrl(resource.normalizedOrigin, resource.routeTemplate),
      amountWithAsset(resource.amountAtomic, resource.asset),
      resource.lastVerifiedAt,
    ]),
    ["LISTING", "METHOD", "RESOURCE", "PRICE", "LAST VERIFIED"],
  )) {
    io.stdout(line);
  }
  return EXIT.ok;
}

function renderResource(
  io: Io,
  resource: CatalogResource,
  health: unknown,
): void {
  io.stdout(`${resource.name} — ${resource.providerDisplayName}`);
  io.stdout(resource.description);
  io.stdout("");
  io.stdout(
    `Resource:       ${resource.method} ${resourceUrl(resource.normalizedOrigin, resource.routeTemplate)}`,
  );
  io.stdout(`Network:        ${resource.network}`);
  io.stdout(
    `Observed price: ${amountWithAsset(resource.amountAtomic, resource.asset)}`,
  );
  io.stdout(`Recipient:      ${resource.recipient}`);
  io.stdout(`Last verified:  ${resource.lastVerifiedAt} (server-observed)`);
  io.stdout(
    `Health:         ${health === null ? "no observation recorded yet" : JSON.stringify(health)}`,
  );
}

/** `inspect` and its `try` alias: fresh observed price plus its timestamp. */
export async function inspectCommand(
  input: CatalogCommandInput,
  withPrepareGuidance: boolean,
): Promise<ExitCode> {
  const reference = input.positionals[0];
  if (reference === undefined) {
    throw new CliUsageError(
      "Pass a listing ID or the resource's canonical URL: " +
        "sotto inspect <resource> | sotto try <resource-url>",
    );
  }
  const { client } = buildClient(
    input.env,
    apiOriginFlag(input.flags),
    input.fetchImpl,
  );
  const resource = await resolveResource(client, reference);
  const health = await client.catalog.resourceHealth(resource.listingId);
  if (input.flags.json === true) {
    printJson(input.io, { resource, health });
    return EXIT.ok;
  }
  renderResource(input.io, resource, health);
  if (withPrepareGuidance) {
    input.io.stdout("");
    input.io.stdout("To prepare this exact paid call for human approval:");
    input.io.stdout(`  sotto buy ${resource.listingId}`);
    input.io.stdout(
      "Purchase initiation re-observes the live 402; a changed price stops " +
        "before anything is journaled.",
    );
  }
  return EXIT.ok;
}
