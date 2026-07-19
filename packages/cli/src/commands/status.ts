import { pairedOutcome } from "@sotto/purchase-client";
import type { Env } from "../config.js";
import { buildClient, requireToken, CliUsageError } from "../core.js";
import { EXIT, type ExitCode } from "../exit-codes.js";
import { printJson, railLine, truncateUpdateId, type Io } from "../output.js";
import { STATION_LABELS, reconcileGuidance } from "./rail.js";
import { followToExit } from "./buy.js";
import type { FetchLike } from "@sotto/purchase-client";

export type StatusCommandInput = Readonly<{
  io: Io;
  env: Env;
  positionals: readonly string[];
  flags: Readonly<Record<string, string | boolean | undefined>>;
  fetchImpl?: FetchLike;
}>;

function originFlag(
  flags: StatusCommandInput["flags"],
): Readonly<{ apiOrigin?: string }> {
  return typeof flags["api-origin"] === "string"
    ? { apiOrigin: flags["api-origin"] }
    : {};
}

export async function statusCommand(
  input: StatusCommandInput,
): Promise<ExitCode> {
  const attemptId = input.positionals[0];
  if (attemptId === undefined) {
    throw new CliUsageError("Pass the attempt ID: sotto status <attemptId>");
  }
  const context = buildClient(
    input.env,
    originFlag(input.flags),
    input.fetchImpl,
  );
  requireToken(context.settings);
  const detail = await context.client.purchases.get(attemptId);
  const outcome = pairedOutcome(
    detail.attempt.state,
    detail.delivery?.claimState ?? null,
  );
  if (input.flags.json === true) {
    printJson(input.io, { ...detail, pairedOutcome: outcome });
    return EXIT.ok;
  }
  const { io } = input;
  io.stdout(`Attempt ${detail.attempt.attemptId}`);
  io.stdout(`State:          ${detail.attempt.state}`);
  io.stdout(`Created:        ${detail.attempt.createdAt}`);
  io.stdout(`Execute before: ${detail.attempt.executeBefore}`);
  for (const event of detail.events) {
    io.stdout(
      railLine(
        "done",
        event.recordedAt,
        STATION_LABELS[event.type] ?? event.type,
      ),
    );
  }
  io.stdout(
    `Settlement:     ${detail.settlement?.state ?? "not submitted"}` +
      (detail.settlement?.updateId == null
        ? ""
        : ` — update ${truncateUpdateId(detail.settlement.updateId)}`),
  );
  io.stdout(
    `Delivery:       ${detail.delivery?.claimState ?? "not started"}` +
      (detail.delivery?.failureCode == null
        ? ""
        : ` (${detail.delivery.failureCode})`),
  );
  if (outcome.deliveryPending || outcome.deliveryFailed) {
    reconcileGuidance(io, detail.attempt.attemptId);
  }
  if (input.flags.follow === true && detail.events.length > 0) {
    const lastSequence = detail.events[detail.events.length - 1]?.sequence ?? 0;
    return followToExit(io, context.client, attemptId, {
      executeBefore: detail.attempt.executeBefore,
      walletUrl: context.settings.walletUrl,
      lastEventId: lastSequence,
    });
  }
  return EXIT.ok;
}

export async function evidenceCommand(
  input: StatusCommandInput,
): Promise<ExitCode> {
  const attemptId = input.positionals[0];
  if (attemptId === undefined) {
    throw new CliUsageError("Pass the attempt ID: sotto evidence <attemptId>");
  }
  const context = buildClient(
    input.env,
    originFlag(input.flags),
    input.fetchImpl,
  );
  const evidence = await context.client.attempts.evidence(attemptId);
  if (input.flags.json === true) {
    printJson(input.io, { attempt: evidence });
    return EXIT.ok;
  }
  const { io } = input;
  io.stdout(`Attempt ${evidence.attemptId}`);
  if (evidence.resource !== null) {
    io.stdout(
      `Resource:   ${evidence.resource.method} ${evidence.resource.origin}${evidence.resource.route}`,
    );
  }
  if (evidence.amount !== null) {
    io.stdout(
      `Amount:     ${evidence.amount.atomic} ${evidence.amount.asset} (atomic units)`,
    );
  }
  io.stdout(
    `Settlement: ${evidence.settlement.status}` +
      (evidence.settlement.updateId === null
        ? ""
        : ` — update ${evidence.settlement.updateId}`),
  );
  if (evidence.settlement.explorerUrl !== null) {
    io.stdout(`Explorer:   ${evidence.settlement.explorerUrl}`);
  }
  io.stdout(
    `Delivery:   ${evidence.delivery.status}` +
      (evidence.delivery.failureCode === null
        ? ""
        : ` (${evidence.delivery.failureCode})`),
  );
  for (const entry of evidence.timeline) {
    io.stdout(
      railLine("done", entry.recordedAt, `${entry.type} [${entry.source}]`),
    );
  }
  for (const redaction of evidence.redactions) {
    io.stdout(`Withheld:   ${redaction.field} — ${redaction.reason}`);
  }
  return EXIT.ok;
}

export async function statsCommand(
  input: StatusCommandInput,
): Promise<ExitCode> {
  const context = buildClient(
    input.env,
    originFlag(input.flags),
    input.fetchImpl,
  );
  const window =
    typeof input.flags.window === "string" ? input.flags.window : "7d";
  const stats = await context.client.stats.read(window);
  if (input.flags.json === true) {
    printJson(input.io, stats);
    return EXIT.ok;
  }
  const { io } = input;
  const rate = (value: number | null) =>
    value === null
      ? "unavailable (no denominator)"
      : `${(value * 100).toFixed(1)}%`;
  io.stdout(`Window: ${stats.window}`);
  io.stdout(
    `Attempts: ${stats.attempts.total} total, ${stats.attempts.executed} executed`,
  );
  io.stdout(`Settlement rate: ${rate(stats.attempts.settlementRate)}`);
  io.stdout(`Delivery rate:   ${rate(stats.attempts.deliveryRate)}`);
  io.stdout(
    `Probes: ${stats.probes.observations} observations, healthy rate ${rate(stats.probes.healthyRate)}`,
  );
  io.stdout(`Source commit: ${stats.sourceCommit}`);
  return EXIT.ok;
}
