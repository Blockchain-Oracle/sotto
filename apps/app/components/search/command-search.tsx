"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Dialog, Input, Skeleton, truncateUpdateId } from "../ui";
import { formatAtomicAmount } from "../../lib/present";
import { useAttempts, useCatalog } from "../../lib/use-api";

type Item = Readonly<{
  key: string;
  group: "Resources" | "Providers" | "Transactions" | "Navigation";
  title: string;
  detail: string;
  href: string;
}>;

const NAVIGATION: readonly Item[] = [
  {
    key: "nav-market",
    group: "Navigation",
    title: "Marketplace",
    detail: "/",
    href: "/",
  },
  {
    key: "nav-scan",
    group: "Navigation",
    title: "Scan",
    detail: "/scan",
    href: "/scan",
  },
  {
    key: "nav-stats",
    group: "Navigation",
    title: "Stats",
    detail: "/stats",
    href: "/stats",
  },
  {
    key: "nav-composer",
    group: "Navigation",
    title: "Composer",
    detail: "/composer",
    href: "/composer",
  },
  {
    key: "nav-add",
    group: "Navigation",
    title: "Add API",
    detail: "/add-api",
    href: "/add-api",
  },
];

const GROUPS = [
  "Resources",
  "Providers",
  "Transactions",
  "Navigation",
] as const;

/**
 * ⌘K command search (surface map 01/S02): client-side match over the real
 * fetched catalog and attempt feed plus navigation. Private request or
 * result text is never indexed here.
 */
export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const catalog = useCatalog();
  const attempts = useAttempts(50);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const items = useMemo<readonly Item[]>(() => {
    const resources: Item[] = (catalog.data ?? []).map((resource) => ({
      key: `res-${resource.listingId}`,
      group: "Resources",
      title: resource.name,
      detail: `${resource.method} ${resource.routeTemplate} · ${resource.providerDisplayName} · ${formatAtomicAmount(resource.amountAtomic, resource.asset)}`,
      href: `/resources/${resource.listingId}`,
    }));
    const providerIds = new Map<string, Item>();
    for (const resource of catalog.data ?? []) {
      if (!providerIds.has(resource.providerId)) {
        providerIds.set(resource.providerId, {
          key: `prv-${resource.providerId}`,
          group: "Providers",
          title: resource.providerDisplayName,
          detail: resource.normalizedOrigin,
          href: `/providers/${resource.providerId}`,
        });
      }
    }
    const transactions: Item[] = (attempts.data ?? []).map((attempt) => ({
      key: `att-${attempt.attemptId}`,
      group: "Transactions",
      title: truncateUpdateId(attempt.attemptId.replace(/^sha256:/u, "")),
      detail: `${attempt.resourceName} · ${formatAtomicAmount(attempt.amountAtomic, attempt.asset)} · ${attempt.state}`,
      href: `/scan/${attempt.attemptId}`,
    }));
    return [
      ...resources,
      ...providerIds.values(),
      ...transactions,
      ...NAVIGATION,
    ];
  }, [catalog.data, attempts.data]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return items.filter(
        (item) => item.group === "Navigation" || item.group === "Resources",
      );
    }
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.detail.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const go = (item: Item) => {
    onOpenChange(false);
    router.push(item.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      const item = matches[cursor];
      if (item !== undefined) go(item);
    }
  };

  const loading = catalog.loading || attempts.loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Search Sotto">
      <div onKeyDown={onKeyDown}>
        <Input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          placeholder="Resources, providers, attempt or update IDs…"
          aria-label="Search"
        />
        {loading ? (
          <div className="app-skeleton-rows" style={{ marginTop: 12 }}>
            <Skeleton width="100%" height={30} />
            <Skeleton width="100%" height={30} />
            <Skeleton width="100%" height={30} />
          </div>
        ) : matches.length === 0 ? (
          <p className="app-note">
            No verified resources or transactions match “{query.trim()}”.
          </p>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {GROUPS.map((group) => {
              const grouped = matches.filter((item) => item.group === group);
              if (grouped.length === 0) return null;
              return (
                <div key={group}>
                  <p className="app-cmdk-group">{group}</p>
                  {grouped.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="app-cmdk-item"
                      data-active={
                        matches[cursor]?.key === item.key ? "true" : undefined
                      }
                      onClick={() => go(item)}
                    >
                      <span className="app-cell-main">{item.title}</span>
                      <span className="app-cell-sub app-mono">
                        {item.detail}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {catalog.error !== null && !loading ? (
          <p className="app-note">
            The catalog query failed — navigation still works.{" "}
            <button
              type="button"
              className="app-menu-item"
              style={{ display: "inline", width: "auto", padding: 0 }}
              onClick={catalog.reload}
            >
              Retry
            </button>
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
