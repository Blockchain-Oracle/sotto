"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  Button,
  CopyChip,
  RestState,
  StateChipPair,
  Veil,
  formatUtc,
} from "../ui";
import { ApiError, describeFailure } from "../../lib/api";
import {
  deliveryOutcome,
  eventLabel,
  eventSource,
  formatAtomicAmount,
} from "../../lib/present";
import { useApi } from "../../lib/use-api";
import type { AttemptEvidence } from "../../lib/types";
import { DetailSkeleton } from "../marketplace/skeletons";
import { EvidencePanels } from "./evidence-panels";

function settlementOutcome(evidence: AttemptEvidence) {
  const status = evidence.settlement.status;
  if (status === "settled") return "settled" as const;
  if (status === "settlement-rejected") return "failed" as const;
  return "pending" as const;
}

/** `/scan/[attemptId]` — transaction evidence (surface map 05, DC-3). */
export function EvidenceDetail({ attemptId }: { attemptId: string }) {
  const state = useApi<{ attempt: AttemptEvidence }>(
    `/v1/attempts/${encodeURIComponent(attemptId)}`,
  );
  const now = useMemo(() => new Date(), []);
  void now;

  if (state.loading) return <DetailSkeleton />;
  if (state.error instanceof ApiError && state.error.status === 404) {
    return (
      <RestState
        title="No Sotto-attributed attempt matches this ID."
        detail="Check the attempt ID, or browse the observed feed."
        action={<Link href="/scan">Open Scan</Link>}
      />
    );
  }
  if (state.error !== null || state.data === null) {
    return (
      <div className="app-error-band" role="alert">
        <p>Evidence query failed — {describeFailure(state.error)}</p>
        <Button onClick={state.reload}>Retry</Button>
      </div>
    );
  }

  const evidence = state.data.attempt;
  const reconciling = evidence.state === "execution-started";

  return (
    <>
      <div className="app-detail-head">
        <div className="app-detail-id">
          <div className="app-outcome-head">
            <CopyChip
              value={evidence.attemptId}
              display={`${evidence.attemptId.slice(0, 15)}…${evidence.attemptId.slice(-4)}`}
            />
            <StateChipPair
              settlement={settlementOutcome(evidence)}
              delivery={deliveryOutcome(evidence.delivery.status)}
            />
          </div>
          <div className="app-detail-meta">
            <span className="app-mono">
              {formatUtc(new Date(evidence.createdAt))}
            </span>
            {evidence.resource === null ? (
              <span>Private resource context</span>
            ) : (
              <span className="app-mono">
                {evidence.resource.name} · {evidence.resource.method}{" "}
                {evidence.resource.route}
              </span>
            )}
            {evidence.amount === null ? null : (
              <span className="app-price">
                {formatAtomicAmount(
                  evidence.amount.atomic,
                  evidence.amount.asset,
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {reconciling ? (
        <div className="app-band" style={{ borderColor: "var(--ambra)" }}>
          <p style={{ margin: 0 }}>
            Checking Canton settlement — the submission is on the ledger
            boundary and the journal has not recorded the outcome yet. This page
            reflects reconciliation as it commits; nothing here retries the
            payment.
          </p>
        </div>
      ) : null}

      <div className="app-band">
        <p className="app-band-title">Evidence timeline</p>
        <ul className="app-checklist">
          {evidence.timeline.length === 0 ? (
            <li className="app-check-row" data-state="pending">
              <span className="app-check-state">pending</span>
              No journal events recorded yet.
            </li>
          ) : (
            evidence.timeline.map((entry) => (
              <li
                key={entry.sequence}
                className="app-check-row"
                data-state="passed"
              >
                <span className="app-check-state">
                  {eventSource(entry.type, entry.updateId)}
                </span>
                <span>{eventLabel(entry.type)}</span>
                {entry.updateId === null ? null : (
                  <CopyChip value={entry.updateId} kind="update" />
                )}
                <span className="app-check-when">
                  {formatUtc(new Date(entry.recordedAt))}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <EvidencePanels evidence={evidence} />

      <div className="app-band">
        <p className="app-band-title">Privacy boundary</p>
        <div className="app-boundary">
          <div className="app-boundary-side">
            <h4>Public here</h4>
            <ul>
              <li>Settlement amount and asset</li>
              <li>Canton update evidence when recorded</li>
              <li>Published resource metadata</li>
              <li>Settlement and delivery status, separately</li>
            </ul>
          </div>
          <div className="app-boundary-side">
            <h4>Not public here</h4>
            <ul>
              {(evidence.redactions.length === 0
                ? [
                    { field: "request", reason: "Owner view — un-veiled" },
                    { field: "response", reason: "Owner view — un-veiled" },
                  ]
                : evidence.redactions
              ).map((redaction) => (
                <li key={redaction.field}>
                  <Veil
                    reason={`${redaction.field} — ${redaction.reason}`}
                    veiled={evidence.redactions.length > 0}
                  >
                    <span className="app-mono">{redaction.field}</span>
                  </Veil>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
