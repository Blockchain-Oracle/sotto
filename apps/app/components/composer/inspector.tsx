"use client";

import { Badge, CopyChip, Deadline, SystemRail, type RailEvent } from "../ui";
import { eventLabel, formatAtomicAmount } from "../../lib/present";
import type { CatalogResource } from "../../lib/types";
import type { PurchaseRun } from "../../lib/purchase-machine";
import { useSession } from "../../lib/session";

const RAIL_ORDER = [
  { type: "intent-created", label: "Live 402" },
  { type: "prepared-hash-verified", label: "Prepared" },
  { type: "approval-requested", label: "Authorization" },
  { type: "signature-verified", label: "Signed" },
  { type: "execution-started", label: "Canton settlement" },
  { type: "settlement-reconciled", label: "Settled" },
] as const;

function railEvents(run: PurchaseRun): RailEvent[] {
  const byType = new Map(run.events.map((event) => [event.type, event]));
  const rejected =
    byType.get("settlement-rejected") ??
    byType.get("wallet-rejected") ??
    byType.get("wallet-unsupported");
  const events: RailEvent[] = RAIL_ORDER.map((step) => {
    const committed = byType.get(step.type);
    return {
      key: step.type,
      label: step.label,
      kind: step.type === "settlement-reconciled" ? "settlement" : "mark",
      ...(committed === undefined
        ? {}
        : { at: new Date(committed.recordedAt) }),
    };
  });
  if (rejected !== undefined) {
    return [
      ...events.filter((event) => event.at !== undefined),
      {
        key: rejected.type,
        label: eventLabel(rejected.type),
        kind: "mark",
        at: new Date(rejected.recordedAt),
      },
    ];
  }
  return events;
}

/**
 * Execution inspector (surface map 04/04a): contract snapshot, ONE
 * authorization slot, and the DC-2 status rail advanced only by
 * committed journal events. Agent authority renders as the reserved
 * honest state until Q-003 proves a signer.
 */
export function Inspector({
  resource,
  run,
}: {
  resource: CatalogResource | null;
  run: PurchaseRun;
}) {
  const session = useSession();
  const created = run.created;
  const approvalRequested = run.events.some(
    (event) => event.type === "approval-requested",
  );
  const signed = run.events.some(
    (event) => event.type === "signature-verified",
  );
  const walletUrl = session.display?.walletUrl ?? null;

  return (
    <div>
      <div className="app-band">
        <p className="app-band-title">Contract snapshot</p>
        {resource === null ? (
          <p style={{ margin: 0 }} className="app-cell-sub">
            Select a resource to pin its live payment contract here.
          </p>
        ) : (
          <dl className="app-kv">
            <dt>Resource</dt>
            <dd>{resource.name}</dd>
            <dt>x402 / scheme</dt>
            <dd>
              v{resource.x402Version} · {resource.scheme}
            </dd>
            <dt>Network</dt>
            <dd>{resource.network}</dd>
            <dt>Price</dt>
            <dd>{formatAtomicAmount(resource.amountAtomic, resource.asset)}</dd>
            <dt>Recipient</dt>
            <dd>
              <CopyChip value={resource.recipient} kind="party" />
            </dd>
            {created === null ? null : (
              <>
                <dt>Request fingerprint</dt>
                <dd>
                  <CopyChip value={created.attemptId} kind="update" />
                </dd>
                <dt>Command</dt>
                <dd>
                  <CopyChip value={created.commandId} kind="update" />
                </dd>
              </>
            )}
          </dl>
        )}
      </div>

      <div className="app-band">
        <p className="app-band-title">Authorization</p>
        <p style={{ margin: "0 0 6px" }}>
          <Badge tone="lapis">Human wallet approval</Badge>
        </p>
        {created === null ? (
          <p className="app-cell-sub" style={{ margin: 0 }}>
            Preparing a call requests approval from your connected wallet. Agent
            authority is reserved and unavailable on this deployment — no
            autonomous signer is proven.
          </p>
        ) : (
          <>
            {approvalRequested && !signed ? (
              <p style={{ margin: "0 0 6px" }}>
                Approval requested —{" "}
                {walletUrl === null ? (
                  "open your wallet to approve or reject."
                ) : (
                  <a
                    href={walletUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: "var(--lapis)" }}
                  >
                    open the wallet approval page
                  </a>
                )}
              </p>
            ) : null}
            <Deadline
              until={new Date(created.executeBefore)}
              label="Execute before"
            />
          </>
        )}
      </div>

      <div className="app-band">
        <p className="app-band-title">Status</p>
        {created === null ? (
          <p className="app-cell-sub" style={{ margin: 0 }}>
            The lifecycle rail engraves each committed journal event here.
          </p>
        ) : (
          <SystemRail label="Purchase lifecycle" events={railEvents(run)} />
        )}
        {run.phase === "streaming" &&
        run.events.some((e) => e.type === "execution-started") &&
        !run.events.some(
          (e) =>
            e.type === "settlement-reconciled" ||
            e.type === "settlement-rejected",
        ) ? (
          <p className="app-note">
            Checking Canton settlement — reconciliation continues from the
            journal; there is no retry-payment action while the outcome is
            unknown.
          </p>
        ) : null}
      </div>
    </div>
  );
}
