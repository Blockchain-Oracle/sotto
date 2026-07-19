"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Button, RestState, Table } from "../ui";
import { describeFailure } from "../../lib/api";
import { formatAtomicAmount } from "../../lib/present";
import { useAttempts, useCatalog } from "../../lib/use-api";
import { useHealthMap } from "../../lib/use-health";
import { DetailSkeleton } from "../marketplace/skeletons";
import { HealthCell } from "../marketplace/health-cell";
import { ResourceActivity } from "./resource-sections";

/**
 * `/providers/[providerId]` (surface map 02). The catalog is the only
 * public provider source; a provider is its published resources. Health
 * aggregates per-resource observations — nothing is summarized beyond
 * what was actually probed.
 */
export function ProviderDetail({ providerId }: { providerId: string }) {
  const router = useRouter();
  const catalog = useCatalog();
  const attempts = useAttempts(50);
  const now = useMemo(() => new Date(), []);

  const resources = useMemo(
    () =>
      (catalog.data ?? []).filter(
        (resource) => resource.providerId === providerId,
      ),
    [catalog.data, providerId],
  );
  const healthMap = useHealthMap(
    useMemo(() => resources.map((r) => r.listingId), [resources]),
  );

  if (catalog.loading) return <DetailSkeleton />;
  if (catalog.error !== null) {
    return (
      <div className="app-error-band" role="alert">
        <p>Catalog query failed — {describeFailure(catalog.error)}</p>
        <Button onClick={catalog.reload}>Retry</Button>
      </div>
    );
  }
  if (resources.length === 0) {
    return (
      <RestState
        title="No published provider matches this ID."
        detail="The provider may have been removed; historical Scan evidence remains."
        action={<Link href="/scan">Open Scan</Link>}
      />
    );
  }

  const first = resources[0]!;
  const statuses = resources.map(
    (resource) => healthMap.get(resource.listingId)?.status ?? null,
  );
  const failing = statuses.filter((status) => status === "failing").length;

  return (
    <>
      <div className="app-detail-head">
        <div className="app-detail-id">
          <h1 className="app-detail-name">{first.providerDisplayName}</h1>
          <div className="app-detail-meta">
            <span className="app-mono">{first.normalizedOrigin}</span>
            <span>
              {resources.length} verified{" "}
              {resources.length === 1 ? "resource" : "resources"}
            </span>
            {failing > 0 ? (
              <span className="app-health" data-tone="rosso">
                <span className="app-health-dot" aria-hidden="true" />
                {failing} failing
              </span>
            ) : null}
          </div>
        </div>
        <div className="app-head-actions">
          <Link href={`/composer?resource=${first.listingId}`}>
            <Button variant="primary">Open in Composer</Button>
          </Link>
        </div>
      </div>

      <Table label="Provider resources">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Route</th>
            <th className="sv-num">Price</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr
              key={resource.listingId}
              className="app-row-link"
              onClick={() => router.push(`/resources/${resource.listingId}`)}
            >
              <td>
                <span className="app-cell-main">{resource.name}</span>
                <div className="app-cell-sub">{resource.description}</div>
              </td>
              <td className="app-mono">
                {resource.method} {resource.routeTemplate}
              </td>
              <td className="sv-num app-price">
                {formatAtomicAmount(resource.amountAtomic, resource.asset)}
              </td>
              <td>
                <HealthCell
                  health={healthMap.get(resource.listingId)}
                  now={now}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div style={{ marginTop: 16 }}>
        <ResourceActivity
          attempts={
            attempts.data === null
              ? null
              : attempts.data.filter(
                  (attempt) =>
                    attempt.normalizedOrigin === first.normalizedOrigin,
                )
          }
          origin={first.normalizedOrigin}
          route={null}
          now={now}
        />
      </div>
    </>
  );
}
