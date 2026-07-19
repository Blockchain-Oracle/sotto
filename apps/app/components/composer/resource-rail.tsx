"use client";

import { useMemo, useState } from "react";

import { Button, Input, Skeleton } from "../ui";
import { describeFailure } from "../../lib/api";
import { formatAtomicAmount } from "../../lib/present";
import type { CatalogResource } from "../../lib/types";
import type { ApiState } from "../../lib/use-api";

/**
 * Composer resource rail (surface map 04): only marketplace resources are
 * callable; the selected resource stays pinned at the top. Arbitrary URLs
 * are never accepted.
 */
export function ResourceRail({
  catalog,
  selectedId,
  onSelect,
}: {
  catalog: ApiState<readonly CatalogResource[]>;
  selectedId: string | null;
  onSelect: (listingId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = catalog.data ?? [];
    const filtered =
      needle === ""
        ? all
        : all.filter((resource) =>
            [
              resource.name,
              resource.providerDisplayName,
              resource.routeTemplate,
            ]
              .join(" ")
              .toLowerCase()
              .includes(needle),
          );
    const selected = all.find((r) => r.listingId === selectedId);
    if (selected === undefined) return filtered;
    return [selected, ...filtered.filter((r) => r.listingId !== selectedId)];
  }, [catalog.data, query, selectedId]);

  return (
    <div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search verified resources…"
        aria-label="Search verified resources"
        style={{ width: "100%", marginBottom: 10 }}
      />
      {catalog.loading ? (
        <div className="app-skeleton-rows">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} width="100%" height={58} />
          ))}
        </div>
      ) : catalog.error !== null ? (
        <div>
          <p className="app-note">
            Catalog unavailable — {describeFailure(catalog.error)}
          </p>
          <Button onClick={catalog.reload}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <p className="app-note">
          {query.trim() === ""
            ? "No verified resources are published yet."
            : "No verified resources match this search."}
        </p>
      ) : (
        items.map((resource) => (
          <button
            key={resource.listingId}
            type="button"
            className="app-rail-item"
            data-selected={
              resource.listingId === selectedId ? "true" : undefined
            }
            onClick={() => onSelect(resource.listingId)}
          >
            <div className="app-rail-line">
              <span className="app-cell-main">{resource.name}</span>
              <span className="app-price">
                {formatAtomicAmount(resource.amountAtomic, resource.asset)}
              </span>
            </div>
            <div className="app-rail-route">
              {resource.method} {resource.routeTemplate}
            </div>
            <div className="app-cell-sub">{resource.providerDisplayName}</div>
          </button>
        ))
      )}
    </div>
  );
}
