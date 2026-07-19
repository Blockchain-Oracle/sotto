"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button, Input, RestState, Select, Table } from "../ui";
import { describeFailure } from "../../lib/api";
import { formatAtomicAmount, isStaleProbe } from "../../lib/present";
import { useCatalog, useStats } from "../../lib/use-api";
import { useHealthMap } from "../../lib/use-health";
import { HealthCell } from "./health-cell";
import { StatBand } from "./stat-band";
import { MarketplaceSkeleton } from "./skeletons";

const SORTS = [
  { value: "recent", label: "Recently verified" },
  { value: "price-asc", label: "Price · low first" },
  { value: "price-desc", label: "Price · high first" },
  { value: "name", label: "Name" },
];

/** `/` — the working marketplace (surface map 02). */
export function Marketplace() {
  const router = useRouter();
  const catalog = useCatalog();
  const stats = useStats("7d");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("all");
  const [sort, setSort] = useState("recent");
  const now = useMemo(() => new Date(), []);

  const listingIds = useMemo(
    () => (catalog.data ?? []).map((resource) => resource.listingId),
    [catalog.data],
  );
  const healthMap = useHealthMap(listingIds);

  const methods = useMemo(() => {
    const seen = [
      ...new Set((catalog.data ?? []).map((resource) => resource.method)),
    ];
    return [
      { value: "all", label: "All methods" },
      ...seen.map((value) => ({ value, label: value })),
    ];
  }, [catalog.data]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (catalog.data ?? []).filter((resource) => {
      if (method !== "all" && resource.method !== method) return false;
      if (needle === "") return true;
      return [
        resource.name,
        resource.providerDisplayName,
        resource.routeTemplate,
        resource.normalizedOrigin,
        resource.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const sorted = [...filtered];
    if (sort === "price-asc" || sort === "price-desc") {
      sorted.sort((a, b) => {
        const order = BigInt(a.amountAtomic) - BigInt(b.amountAtomic);
        const sign = order < 0n ? -1 : order > 0n ? 1 : 0;
        return sort === "price-asc" ? sign : -sign;
      });
    } else if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [catalog.data, query, method, sort]);

  if (catalog.loading) return <MarketplaceSkeleton />;

  const staleIndex =
    catalog.data !== null &&
    catalog.data.length > 0 &&
    catalog.data.every((resource) =>
      isStaleProbe(resource.lastVerifiedAt, now),
    );

  return (
    <>
      <div className="app-page-head">
        <div>
          <h1 className="app-page-title">Canton x402 marketplace</h1>
          <p className="app-page-sub">
            Verified paid APIs that settle through Canton.
          </p>
        </div>
        <div className="app-head-actions">
          <Link href="/add-api">
            <Button variant="primary">Add API</Button>
          </Link>
        </div>
      </div>

      {catalog.error !== null ? (
        <div className="app-error-band" role="alert">
          <p>Catalog query failed — {describeFailure(catalog.error)}</p>
          <Button onClick={catalog.reload}>Retry</Button>
        </div>
      ) : null}

      <StatBand
        resources={catalog.data}
        stats={stats.data}
        statsFailed={stats.error !== null}
      />

      {staleIndex ? (
        <div className="app-band" style={{ borderColor: "var(--ambra)" }}>
          <p style={{ margin: 0 }}>
            Every indexed record is older than the freshness window — records
            stay inspectable, but re-probe before relying on prices.
          </p>
        </div>
      ) : null}

      {catalog.data !== null && catalog.data.length === 0 ? (
        catalog.error === null ? (
          <RestState
            title="No verified Canton resources yet."
            detail="The first audited x402 endpoint published here opens the marketplace."
            action={
              <Link href="/add-api">
                <Button variant="primary">Add API</Button>
              </Link>
            }
          />
        ) : null
      ) : catalog.data !== null ? (
        <>
          <div className="app-toolbar">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search resources…"
              aria-label="Search resources"
            />
            <Select
              options={methods}
              value={method}
              onValueChange={setMethod}
            />
            <Select options={SORTS} value={sort} onValueChange={setSort} />
          </div>
          {rows.length === 0 ? (
            <RestState
              title="No resources match these filters."
              action={
                <Button
                  onClick={() => {
                    setQuery("");
                    setMethod("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table label="Verified resources">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Resource</th>
                  <th>Route</th>
                  <th className="sv-num">Price</th>
                  <th>Health</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((resource) => (
                  <tr
                    key={resource.listingId}
                    className="app-row-link"
                    onClick={() =>
                      router.push(`/resources/${resource.listingId}`)
                    }
                  >
                    <td>{resource.providerDisplayName}</td>
                    <td>
                      <span className="app-cell-main">{resource.name}</span>
                      <div className="app-cell-sub">{resource.description}</div>
                    </td>
                    <td className="app-mono">
                      {resource.method} {resource.routeTemplate}
                    </td>
                    <td className="sv-num app-price">
                      {formatAtomicAmount(
                        resource.amountAtomic,
                        resource.asset,
                      )}
                    </td>
                    <td>
                      <HealthCell
                        health={healthMap.get(resource.listingId)}
                        now={now}
                      />
                    </td>
                    <td>
                      <Link
                        href={`/composer?resource=${resource.listingId}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button variant="ghost">Try</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      ) : null}
    </>
  );
}
