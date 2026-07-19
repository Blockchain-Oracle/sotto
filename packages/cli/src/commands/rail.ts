import {
  isTerminalAttemptState,
  pairedOutcome,
  type AttemptEvent,
  type PurchaseDetail,
  type SottoClient,
} from "@sotto/purchase-client";
import { EXIT, type ExitCode } from "../exit-codes.js";
import { bold, railLine, type Io } from "../output.js";

export const STATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "intent-created": "Intent journaled",
  "prepared-hash-verified": "Prepared transaction hash verified",
  "approval-requested": "Human wallet approval requested",
  "wallet-rejected": "Wallet rejected this exact call",
  "wallet-unsupported": "Wallet cannot sign this transaction shape",
  "signature-verified": "Wallet signature verified",
  "execution-started": "Canton execution started",
  "settlement-reconciled": "Settlement reconciled on Canton",
  "settlement-rejected": "Settlement rejected by Canton",
});

export function renderEvent(io: Io, event: AttemptEvent): void {
  io.stdout(
    railLine(
      "done",
      event.recordedAt,
      `${STATION_LABELS[event.type] ?? event.type}${
        event.updateId === null ? "" : ` — update ${event.updateId}`
      }`,
    ),
  );
}

export function renderApprovalBlock(
  io: Io,
  walletUrl: string | undefined,
): void {
  io.stdout("");
  io.stdout(bold(io, "── HUMAN APPROVAL REQUIRED ──────────────────────────"));
  io.stdout("A human must approve this exact prepared call in the Sotto");
  io.stdout("wallet before any value moves. This CLI cannot sign anything.");
  if (walletUrl !== undefined) {
    io.stdout(bold(io, `Wallet approval page: ${walletUrl}`));
  } else {
    io.stdout(
      "Open the wallet link from your Sotto onboarding to approve " +
        "(store it once with `sotto login --wallet-url <url>`).",
    );
  }
  io.stdout(bold(io, "─────────────────────────────────────────────────────"));
  io.stdout("");
}

export function reconcileGuidance(io: Io, attemptId: string): void {
  io.stderr(
    "This outcome is not final proof of delivery. Do NOT retry the " +
      "purchase — a second attempt can pay twice for one call.",
  );
  io.stderr(`Reconcile with: sotto status ${attemptId}`);
  io.stderr(`Evidence:       sotto evidence ${attemptId}`);
}

const DELIVERY_POLL_MS = 2_000;
const DELIVERY_WAIT_MS = 120_000;

/**
 * After the journal's settlement-reconciled terminal event the delivery
 * worker still runs; poll the paired facts until delivery is terminal or
 * the wait budget ends. Settlement and delivery stay two facts.
 */
export async function settleDeliveryExit(
  io: Io,
  client: SottoClient,
  attemptId: string,
  waitMs = DELIVERY_WAIT_MS,
  pollMs = DELIVERY_POLL_MS,
): Promise<ExitCode> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const detail: PurchaseDetail = await client.purchases.get(attemptId);
    const outcome = pairedOutcome(
      detail.attempt.state,
      detail.delivery?.claimState ?? null,
    );
    if (outcome.delivered) {
      io.stdout(
        railLine(
          "done",
          detail.delivery?.respondedAt ?? new Date().toISOString(),
          "Delivered — paid provider response recorded",
        ),
      );
      io.stdout("Settled: yes. Delivered: yes.");
      return EXIT.ok;
    }
    if (outcome.deliveryFailed) {
      io.stdout(
        "Settled: yes. Delivered: NO — delivery " +
          `${detail.delivery?.claimState ?? "unknown"} (${detail.delivery?.failureCode ?? "no failure code"}).`,
      );
      reconcileGuidance(io, attemptId);
      return EXIT.ambiguous;
    }
    if (Date.now() >= deadline) {
      io.stdout(
        "Settled: yes. Delivered: not yet — the delivery worker has not " +
          "reported a terminal state within the wait budget.",
      );
      reconcileGuidance(io, attemptId);
      return EXIT.ambiguous;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export function terminalExit(eventType: string): ExitCode | undefined {
  if (!isTerminalAttemptState(eventType)) return undefined;
  switch (eventType) {
    case "wallet-rejected":
      return EXIT.walletRejected;
    case "wallet-unsupported":
      return EXIT.walletUnsupported;
    case "settlement-rejected":
      return EXIT.settlementRejected;
    default:
      return EXIT.ok; // settlement-reconciled; delivery decided separately
  }
}
