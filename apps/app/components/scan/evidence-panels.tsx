"use client";

import { Badge, Button, CopyChip, formatUtc } from "../ui";
import type { AttemptEvidence } from "../../lib/types";

const SETTLEMENT_LABEL: Readonly<Record<string, string>> = {
  "not-submitted": "Not submitted",
  "settlement-pending": "Settlement pending",
  settled: "Settled",
  "settlement-rejected": "Settlement rejected",
};

const DELIVERY_LABEL: Readonly<Record<string, string>> = {
  "not-started": "Not attempted",
  "delivery-pending": "Retrying paid request",
  delivered: "Delivered",
  "delivery-failed": "Delivery failed",
};

/**
 * Public settlement + delivery panels and, for the session owner, the
 * enriched receipt. The explorer action is disabled with the honest
 * reason when the update exists but no external index carries it.
 */
export function EvidencePanels({ evidence }: { evidence: AttemptEvidence }) {
  const settlement = evidence.settlement;
  const delivery = evidence.delivery;
  return (
    <>
      <div className="app-band">
        <p className="app-band-title">Canton settlement</p>
        <dl className="app-kv">
          <dt>Network</dt>
          <dd>Canton DevNet</dd>
          <dt>Status</dt>
          <dd>{SETTLEMENT_LABEL[settlement.status] ?? settlement.status}</dd>
          <dt>Update ID</dt>
          <dd>
            {settlement.updateId === null ? (
              "—"
            ) : (
              <CopyChip value={settlement.updateId} kind="update" />
            )}
          </dd>
        </dl>
        <div style={{ marginTop: 10 }}>
          {settlement.explorerUrl !== null ? (
            <a
              href={settlement.explorerUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Button>Open in Canton explorer</Button>
            </a>
          ) : (
            <Button
              disabled
              title={
                settlement.updateId === null
                  ? "No Canton update recorded for this attempt"
                  : "Not indexed yet"
              }
            >
              Open in Canton explorer
            </Button>
          )}
          {settlement.updateId !== null && settlement.explorerUrl === null ? (
            <p className="app-note">Not indexed yet.</p>
          ) : null}
        </div>
      </div>

      <div className="app-band">
        <p className="app-band-title">Delivery</p>
        <dl className="app-kv">
          <dt>Status</dt>
          <dd>{DELIVERY_LABEL[delivery.status] ?? delivery.status}</dd>
          {delivery.failureCode === null ? null : (
            <>
              <dt>Failure category</dt>
              <dd>{delivery.failureCode}</dd>
            </>
          )}
          {delivery.respondedAt === null ? null : (
            <>
              <dt>Responded</dt>
              <dd>{formatUtc(new Date(delivery.respondedAt))}</dd>
            </>
          )}
        </dl>
        {settlement.status === "settled" &&
        delivery.status === "delivery-failed" ? (
          <p className="app-note">
            Settlement remains settled — the provider failed to deliver the paid
            response. Another payment is never automatically safe.
          </p>
        ) : null}
      </div>

      {evidence.receipt === null ? null : (
        <div className="app-band">
          <p className="app-band-title">
            Owner receipt <Badge tone="lapis">Viewing as owner</Badge>
          </p>
          <dl className="app-kv">
            {Object.entries(evidence.receipt).map(([field, value]) => (
              <FragmentRow key={field} field={field} value={value} />
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

function FragmentRow({
  field,
  value,
}: {
  field: string;
  value: string | null;
}) {
  return (
    <>
      <dt>{field}</dt>
      <dd>{value === null ? "—" : <CopyChip value={value} kind="update" />}</dd>
    </>
  );
}
