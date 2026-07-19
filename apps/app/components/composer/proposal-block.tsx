"use client";

import { CopyChip, formatUtc } from "../ui";
import { formatAtomicAmount } from "../../lib/present";
import type { CatalogResource } from "../../lib/types";
import type { PurchaseRun } from "../../lib/purchase-machine";

/**
 * Immutable proposal block (surface map 04): the exact prepared call —
 * revision, canonical URL, validated input, indexed vs fresh 402 price,
 * recipient — as compact operational data.
 */
export function ProposalBlock({
  resource,
  run,
  values,
}: {
  resource: CatalogResource;
  run: PurchaseRun;
  values: Readonly<Record<string, string>>;
}) {
  const created = run.created;
  if (created === null) return null;
  const inputs = Object.entries(values).filter(
    ([, value]) => value.trim() !== "",
  );
  return (
    <div className="app-proposal">
      <p className="app-band-title">Prepared call</p>
      <dl className="app-kv">
        <dt>Resource revision</dt>
        <dd>
          <CopyChip value={resource.resourceRevisionId} kind="update" />
        </dd>
        <dt>Request</dt>
        <dd>
          {resource.method} {resource.normalizedOrigin}
          {resource.routeTemplate}
        </dd>
        {inputs.length === 0 ? null : (
          <>
            <dt>Validated input</dt>
            <dd>
              {inputs.map(([field, value]) => `${field}=${value}`).join(" · ")}
            </dd>
          </>
        )}
        <dt>Indexed price</dt>
        <dd>
          {formatAtomicAmount(
            created.price.indexed.amountAtomic,
            resource.asset,
          )}
        </dd>
        <dt>Fresh 402 price</dt>
        <dd>
          {formatAtomicAmount(
            created.price.observed.amountAtomic,
            resource.asset,
          )}{" "}
          <span className="app-cell-sub">
            observed {formatUtc(new Date(created.price.observed.observedAt))}
          </span>
        </dd>
        <dt>Recipient</dt>
        <dd>
          <CopyChip value={created.price.observed.recipient} kind="party" />
        </dd>
        <dt>Attempt</dt>
        <dd>
          <CopyChip value={created.attemptId} kind="update" />
        </dd>
        <dt>Authorization</dt>
        <dd>Human wallet approval</dd>
      </dl>
      {created.outcome === "replayed" ? (
        <p className="app-note">
          Duplicate intent recognized — this is the already-journaled attempt,
          not a second payment.
        </p>
      ) : null}
    </div>
  );
}
