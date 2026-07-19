"use client";

import Link from "next/link";
import { CopyChip, StateChipPair, formatUtc } from "../ui";
import { settlementFromState } from "../../lib/present";
import type { PurchaseRun } from "../../lib/purchase-machine";

/**
 * Result record (surface map 04): appears once the run reaches its
 * settlement outcome. Delivery facts are the persisted claim — response
 * digest and byte count are real evidence; the response body itself has
 * no read endpoint on this API yet, and that gap is stated rather than
 * papered over with fabricated output.
 */
export function ResultRecord({ run }: { run: PurchaseRun }) {
  const created = run.created;
  if (created === null || run.phase !== "terminal") return null;
  const state =
    run.detail?.attempt.state ??
    run.events.findLast((event) =>
      [
        "settlement-reconciled",
        "settlement-rejected",
        "wallet-rejected",
        "wallet-unsupported",
      ].includes(event.type),
    )?.type ??
    created.state;
  const delivery = run.detail?.delivery ?? null;
  const settled = settlementFromState(state) === "settled";
  return (
    <div className="app-result">
      <p className="app-band-title">Outcome</p>
      <StateChipPair
        settlement={settlementFromState(state)}
        delivery={
          delivery === null
            ? "pending"
            : delivery.respondedAt !== null
              ? "delivered"
              : delivery.failureCode !== null
                ? "failed"
                : "pending"
        }
      />
      {settled && delivery === null ? (
        <p className="app-note">
          Settled on Canton — the paid retry is with the worker; delivery facts
          land here as they commit.
        </p>
      ) : null}
      {delivery !== null ? (
        <dl className="app-kv" style={{ marginTop: 10 }}>
          {delivery.responseStatus === null ? null : (
            <>
              <dt>Provider HTTP status</dt>
              <dd>{delivery.responseStatus}</dd>
            </>
          )}
          {delivery.bodyByteCount === null ? null : (
            <>
              <dt>Response size</dt>
              <dd>{delivery.bodyByteCount} bytes</dd>
            </>
          )}
          {delivery.bodySha256 === null ? null : (
            <>
              <dt>Response digest</dt>
              <dd>
                <CopyChip value={delivery.bodySha256} kind="update" />
              </dd>
            </>
          )}
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
      ) : null}
      {delivery !== null && delivery.respondedAt !== null ? (
        <p className="app-note">
          The response body is stored as private delivery evidence; this API
          exposes its digest and size, not a plaintext reader, so no body is
          rendered here.
        </p>
      ) : null}
      {settled && delivery !== null && delivery.failureCode !== null ? (
        <p className="app-note">
          Settlement stays settled — delivery failed at the provider. Another
          payment is never automatically safe.
        </p>
      ) : null}
      <p style={{ marginTop: 10, marginBottom: 0 }}>
        <Link
          href={`/scan/${created.attemptId}`}
          style={{ color: "var(--lapis)" }}
        >
          Open transaction evidence
        </Link>
      </p>
    </div>
  );
}
