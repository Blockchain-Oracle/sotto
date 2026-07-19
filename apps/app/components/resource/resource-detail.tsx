"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  Badge,
  Button,
  CodeBlock,
  CopyChip,
  RestState,
  formatRelative,
  formatUtc,
} from "../ui";
import { ApiError, describeFailure } from "../../lib/api";
import {
  formatAtomicAmount,
  healthLabel,
  healthTone,
  isStaleProbe,
} from "../../lib/present";
import { useApi, useAttempts } from "../../lib/use-api";
import type { CatalogResource, ResourceHealth } from "../../lib/types";
import { DetailSkeleton } from "../marketplace/skeletons";
import { ResourceActivity, ResourceSchema } from "./resource-sections";

/** `/resources/[listingId]` (surface map 02, all eight states). */
export function ResourceDetail({ listingId }: { listingId: string }) {
  const resource = useApi<{ resource: CatalogResource }>(
    `/v1/resources/${listingId}`,
  );
  const health = useApi<{ health: ResourceHealth | null }>(
    `/v1/resources/${listingId}/health`,
  );
  const attempts = useAttempts(50);
  const now = useMemo(() => new Date(), []);

  if (resource.loading) return <DetailSkeleton />;

  if (resource.error instanceof ApiError && resource.error.status === 404) {
    return (
      <RestState
        title="This resource is no longer published."
        detail="Historical settlement evidence outlives the listing."
        action={<Link href="/scan">Open Scan</Link>}
      />
    );
  }
  if (resource.error !== null || resource.data === null) {
    return (
      <div className="app-error-band" role="alert">
        <p>Resource query failed — {describeFailure(resource.error)}</p>
        <Button onClick={resource.reload}>Retry</Button>
      </div>
    );
  }

  const record = resource.data.resource;
  const observation = health.data?.health ?? null;
  const failing = observation?.status === "failing";
  const stale = isStaleProbe(record.lastVerifiedAt, now);
  const tryBlocked = failing || stale;
  const canonicalUrl = `${record.normalizedOrigin}${record.routeTemplate}`;

  return (
    <>
      <div className="app-detail-head">
        <div className="app-detail-id">
          <h1 className="app-detail-name">
            {record.providerDisplayName} · {record.name}
          </h1>
          <div className="app-detail-meta">
            <span className="app-mono">
              {record.method} {record.routeTemplate}
            </span>
            <span className="app-price">
              {formatAtomicAmount(record.amountAtomic, record.asset)}
            </span>
            {observation === null ? (
              <span className="app-health" data-tone="neutral">
                <span className="app-health-dot" aria-hidden="true" />
                Not probed
              </span>
            ) : (
              <span
                className="app-health"
                data-tone={healthTone(observation.status)}
              >
                <span className="app-health-dot" aria-hidden="true" />
                {healthLabel(observation.status)}
                <span className="app-health-when">
                  probed {formatRelative(new Date(observation.observedAt), now)}
                </span>
              </span>
            )}
            {stale ? <Badge tone="ambra">Stale index</Badge> : null}
          </div>
        </div>
        <div className="app-head-actions">
          {tryBlocked ? (
            <Button disabled title="Blocked until a fresh probe passes">
              Try in Composer
            </Button>
          ) : (
            <Link href={`/composer?resource=${record.listingId}`}>
              <Button variant="primary">Try in Composer</Button>
            </Link>
          )}
        </div>
      </div>

      {failing && observation !== null ? (
        <div className="app-error-band" role="alert">
          <p>
            The last probe failed at the {observation.failureDomain ?? "probe"}{" "}
            boundary ({observation.failureCode ?? "unknown code"}
            {observation.httpStatus === null
              ? ""
              : `, HTTP ${observation.httpStatus}`}
            ). Execution is blocked until a fresh probe passes.
          </p>
        </div>
      ) : stale ? (
        <div className="app-band" style={{ borderColor: "var(--ambra)" }}>
          <p style={{ margin: 0 }}>
            The last verification is older than the freshness window — Try is
            blocked until the resource is re-probed.
          </p>
        </div>
      ) : null}

      <div className="app-band">
        <p className="app-band-title">What it does</p>
        <p style={{ margin: 0 }}>{record.description}</p>
      </div>

      <div className="app-band">
        <p className="app-band-title">Live payment contract</p>
        <dl className="app-kv">
          <dt>x402 version</dt>
          <dd>{record.x402Version}</dd>
          <dt>Scheme</dt>
          <dd>{record.scheme}</dd>
          <dt>Network</dt>
          <dd>{record.network}</dd>
          <dt>Asset</dt>
          <dd>{record.asset}</dd>
          <dt>Price</dt>
          <dd>{formatAtomicAmount(record.amountAtomic, record.asset)}</dd>
          <dt>Recipient</dt>
          <dd>
            <CopyChip value={record.recipient} kind="party" />
          </dd>
          <dt>Transfer method</dt>
          <dd>{record.transferMethod}</dd>
          <dt>Observed</dt>
          <dd>{formatUtc(new Date(record.lastVerifiedAt))}</dd>
        </dl>
        <p className="app-note">
          Observed from the live 402 by the Sotto probe — browser-submitted
          fields are never authority.
        </p>
      </div>

      <ResourceSchema routeTemplate={record.routeTemplate} />

      <div className="app-band">
        <p className="app-band-title">Reliability</p>
        {observation === null ? (
          <p style={{ margin: 0 }}>
            No health observations recorded for this revision yet.
          </p>
        ) : (
          <dl className="app-kv">
            <dt>Status</dt>
            <dd>{healthLabel(observation.status)}</dd>
            <dt>Probe latency</dt>
            <dd>{observation.latencyMilliseconds} ms</dd>
            <dt>Observed</dt>
            <dd>{formatUtc(new Date(observation.observedAt))}</dd>
          </dl>
        )}
      </div>

      <ResourceActivity
        attempts={attempts.data}
        origin={record.normalizedOrigin}
        route={record.routeTemplate}
        now={now}
      />

      <div className="app-band">
        <p className="app-band-title">Integration handoff</p>
        <dl className="app-kv">
          <dt>Canonical URL</dt>
          <dd>
            <CopyChip value={canonicalUrl} />
          </dd>
        </dl>
        <CodeBlock label="CLI" code={`sotto try ${canonicalUrl}`} />
        <p className="app-note">
          MCP resource identifier — shipping this cycle; not yet published.
        </p>
      </div>
    </>
  );
}
