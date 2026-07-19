import {
  SottoApiError,
  pairedOutcome,
  type PurchaseInitiated,
  type SottoClient,
} from "@sotto/purchase-client";
import type { Env } from "../config.js";
import {
  buildClient,
  parseMaxPrice,
  requireToken,
  CliUsageError,
} from "../core.js";
import { EXIT, type ExitCode } from "../exit-codes.js";
import {
  amountWithAsset,
  bold,
  printJson,
  railLine,
  type Io,
} from "../output.js";
import {
  renderApprovalBlock,
  renderEvent,
  reconcileGuidance,
  settleDeliveryExit,
  terminalExit,
} from "./rail.js";
import type { FetchLike } from "@sotto/purchase-client";

export type BuyCommandInput = Readonly<{
  io: Io;
  env: Env;
  positionals: readonly string[];
  flags: Readonly<Record<string, string | boolean | undefined>>;
  fetchImpl?: FetchLike;
}>;

function renderPreparedCall(
  io: Io,
  client: SottoClient,
  initiated: PurchaseInitiated,
  listingId: string,
): void {
  io.stdout(bold(io, "Prepared paid call (exact, one call):"));
  io.stdout(`  Listing:            ${listingId}`);
  io.stdout(`  Attempt:            ${initiated.attemptId}`);
  io.stdout(`  Command ID:         ${initiated.commandId}`);
  io.stdout(
    `  Observed price:     ${initiated.price.observed.amountAtomic} ` +
      `(atomic) at ${initiated.price.observed.observedAt}`,
  );
  io.stdout(`  Recipient:          ${initiated.price.observed.recipient}`);
  io.stdout(`  Execute before:     ${initiated.executeBefore}`);
  io.stdout(`  API origin:         ${client.origin}`);
}

async function renderCommitments(
  io: Io,
  client: SottoClient,
  attemptId: string,
): Promise<void> {
  const detail = await client.purchases.get(attemptId);
  io.stdout(`  Request commitment: ${detail.attempt.requestCommitment}`);
  io.stdout(`  Purchase commit.:   ${detail.attempt.purchaseCommitment}`);
  io.stdout(
    `  Prepared tx hash:   ${detail.attempt.preparedTransactionHash ?? "not prepared yet — appears at prepared-hash-verified"}`,
  );
}

/**
 * `sotto buy <listingId>`: initiates one exact purchase, prints the
 * prepared call and its commitments, then follows the journal SSE as a
 * text rail. Every station line is an already-committed journal row; the
 * CLI never signs, never retries an ambiguous outcome, and exits with a
 * distinct code per terminal fact.
 */
export async function buyCommand(input: BuyCommandInput): Promise<ExitCode> {
  const { io, flags } = input;
  const listingId = input.positionals[0];
  if (listingId === undefined) {
    throw new CliUsageError(
      "Pass the listing ID of the verified resource: sotto buy <listingId>",
    );
  }
  if (flags.input !== undefined) {
    throw new CliUsageError(
      "The purchasing API binds no request input yet — only parameterless " +
        "resources are purchasable, so --input has nothing to carry. " +
        "Drop --input to purchase the exact listed call.",
    );
  }
  const context = buildClient(
    input.env,
    typeof flags["api-origin"] === "string"
      ? { apiOrigin: flags["api-origin"] }
      : {},
    input.fetchImpl,
  );
  requireToken(context.settings);
  const { client } = context;
  const maxPrice = parseMaxPrice(
    typeof flags["max-price"] === "string" ? flags["max-price"] : undefined,
  );
  if (maxPrice !== undefined) {
    const resource = await client.catalog.resourceByListing(listingId);
    if (BigInt(resource.amountAtomic) > maxPrice) {
      io.stderr(
        `Local policy stop (not a ledger limit): the indexed price ` +
          `${amountWithAsset(resource.amountAtomic, resource.asset)} exceeds ` +
          `--max-price ${maxPrice}. Nothing was initiated.`,
      );
      return EXIT.usage;
    }
  }
  const initiated = (await client.purchases.initiate(
    listingId,
  )) as PurchaseInitiated;
  renderPreparedCall(io, client, initiated, listingId);
  await renderCommitments(io, client, initiated.attemptId);
  io.stdout("");
  if (flags["no-wait"] === true) {
    if (flags.json === true) printJson(io, initiated);
    io.stdout(`Follow it with: sotto status ${initiated.attemptId} --follow`);
    return EXIT.ok;
  }
  return followToExit(io, client, initiated.attemptId, {
    executeBefore: initiated.executeBefore,
    walletUrl: context.settings.walletUrl,
    json: flags.json === true,
  });
}

export async function followToExit(
  io: Io,
  client: SottoClient,
  attemptId: string,
  options: Readonly<{
    executeBefore?: string;
    walletUrl?: string | undefined;
    json?: boolean;
    lastEventId?: number;
  }>,
): Promise<ExitCode> {
  io.stdout(railLine("active", null, "Following the purchase journal…"));
  let lastType: string | undefined;
  const expiresAt =
    options.executeBefore === undefined
      ? undefined
      : Date.parse(options.executeBefore);
  const controller = new AbortController();
  const expiry =
    expiresAt === undefined
      ? undefined
      : setTimeout(
          () => controller.abort(),
          // Small grace after execute-before: a settlement event recorded
          // right at the deadline still arrives before the stream stops.
          Math.max(expiresAt - Date.now() + 5_000, 1_000),
        );
  try {
    for await (const event of client.purchases.follow(attemptId, {
      signal: controller.signal,
      ...(options.lastEventId === undefined
        ? {}
        : { lastEventId: options.lastEventId }),
    })) {
      renderEvent(io, event);
      lastType = event.type;
      if (event.type === "approval-requested") {
        renderApprovalBlock(io, options.walletUrl);
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      if (error instanceof SottoApiError) throw error;
      io.stderr(String(error instanceof Error ? error.message : error));
      reconcileGuidance(io, attemptId);
      return EXIT.ambiguous;
    }
  } finally {
    if (expiry !== undefined) clearTimeout(expiry);
  }
  if (controller.signal.aborted && terminalExit(lastType ?? "") === undefined) {
    io.stdout(
      "The execute-before deadline passed without a terminal journal " +
        "event. The attempt can no longer settle as prepared.",
    );
    reconcileGuidance(io, attemptId);
    return EXIT.expired;
  }
  const exit = terminalExit(lastType ?? "");
  if (exit === undefined) {
    reconcileGuidance(io, attemptId);
    return EXIT.ambiguous;
  }
  if (exit !== EXIT.ok) {
    if (options.json === true) {
      const detail = await client.purchases.get(attemptId);
      printJson(io, detail);
    }
    return exit;
  }
  const deliveryExit = await settleDeliveryExit(io, client, attemptId);
  if (options.json === true) {
    const detail = await client.purchases.get(attemptId);
    printJson(io, {
      ...detail,
      pairedOutcome: pairedOutcome(
        detail.attempt.state,
        detail.delivery?.claimState ?? null,
      ),
    });
  }
  return deliveryExit;
}
