import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApprovalRecord } from "./approval-store.js";
import { approvalRuntimeState } from "./approval-store.js";
import type { SignerContext } from "./context.js";
import { escapeHtml, formatCantonCoin, renderPage } from "./html.js";
import { readWalletSession, sessionRequired } from "./wallet-session.js";

function summaryList(record: ApprovalRecord): string {
  const approval = record.approval;
  const row = (term: string, value: string) =>
    `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`;
  return `<dl>
${row("Request", `${approval.method} ${approval.resourceOrigin}${approval.resourcePath}`)}
${row("Provider party", approval.providerParty)}
${row("Principal", formatCantonCoin(approval.amountAtomic))}
${row("Fee ceiling", formatCantonCoin(approval.maximumFeeAtomic))}
${row("Total debit ceiling", formatCantonCoin(approval.maximumTotalDebitAtomic))}
${row("Network", approval.network)}
${row("Synchronizer", approval.synchronizerId)}
${row("Package", `${approval.selectedPackage.packageName} ${approval.selectedPackage.packageVersion} (${approval.selectedPackage.packageId})`)}
${row("Execute before", approval.executeBefore)}
</dl>
<p class="note deadline">Approval expires ${escapeHtml(record.expiresAt)} (UTC)</p>`;
}

function statusPage(record: ApprovalRecord, state: string): string {
  const detail: Record<string, string> = {
    approved: "Signature issued for collection.",
    expired: "The approval window closed before a decision.",
    rejected: "No signature was produced.",
  };
  return renderPage(
    "Payment approval",
    `<h1>Payment approval</h1>
<span class="status">${escapeHtml(state.charAt(0).toUpperCase() + state.slice(1))}</span>
<p class="note">${escapeHtml(detail[state] ?? "")}</p>
<section>${summaryList(record)}</section>`,
  );
}

function pendingPage(record: ApprovalRecord): string {
  const id = escapeHtml(record.approvalId);
  return renderPage(
    "Payment approval",
    `<h1>Payment approval</h1>
<span class="status">Pending</span>
<p class="note">This signature authorizes exactly this payment.</p>
<section>${summaryList(record)}</section>
<div class="actions">
<form method="post" action="/approve/${id}/approve">
<button class="approve" type="submit">Approve payment</button></form>
<form method="post" action="/approve/${id}/reject">
<button class="reject" type="submit">Reject</button></form>
</div>`,
  );
}

async function loadOwnedApproval(
  request: FastifyRequest,
  reply: FastifyReply,
  context: SignerContext,
): Promise<ApprovalRecord | null> {
  const walletId = readWalletSession(request, context);
  if (walletId === undefined) return sessionRequired(reply);
  const { approvalId } = request.params as Readonly<{ approvalId: string }>;
  const record = await context.approvals.read(approvalId);
  if (record === undefined || record.walletId !== walletId) {
    void reply
      .status(404)
      .type("text/html; charset=utf-8")
      .send(
        renderPage(
          "Payment approval",
          `<h1>Approval not found</h1>
<p class="note">This approval does not exist for the current wallet
session.</p>`,
        ),
      );
    return null;
  }
  return record;
}

function crossOriginBlocked(
  request: FastifyRequest,
  reply: FastifyReply,
  context: SignerContext,
): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== context.env.publicWalletOrigin) {
    void reply.status(403).send({ error: "cross-origin-request-blocked" });
    return true;
  }
  return false;
}

export function registerApprovalPageRoutes(
  server: FastifyInstance,
  context: SignerContext,
): void {
  server.get("/approve/:approvalId", async (request, reply) => {
    const record = await loadOwnedApproval(request, reply, context);
    if (record === null) return;
    const state = approvalRuntimeState(record, context.now());
    return reply
      .type("text/html; charset=utf-8")
      .send(
        state === "pending" ? pendingPage(record) : statusPage(record, state),
      );
  });

  server.post("/approve/:approvalId/approve", async (request, reply) => {
    if (crossOriginBlocked(request, reply, context)) return;
    const record = await loadOwnedApproval(request, reply, context);
    if (record === null) return;
    if (approvalRuntimeState(record, context.now()) !== "pending") {
      return reply.redirect(`/approve/${record.approvalId}`, 303);
    }
    const wallet = await context.wallets.read(record.walletId);
    if (wallet === undefined) {
      return reply.status(409).send({ error: "wallet-unknown" });
    }
    const signature = await context.signPreparedHash(
      context.keystore.keyFilePath(record.walletId),
      record.preparedTransactionHash,
      wallet.fingerprint,
    );
    await context.approvals.decide(record.approvalId, "approved", signature);
    return reply.redirect(`/approve/${record.approvalId}`, 303);
  });

  server.post("/approve/:approvalId/reject", async (request, reply) => {
    if (crossOriginBlocked(request, reply, context)) return;
    const record = await loadOwnedApproval(request, reply, context);
    if (record === null) return;
    if (approvalRuntimeState(record, context.now()) === "pending") {
      await context.approvals.decide(record.approvalId, "rejected", undefined);
    }
    return reply.redirect(`/approve/${record.approvalId}`, 303);
  });
}
