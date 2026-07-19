"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  Button,
  Input,
  RestState,
  Select,
  StateChipPair,
  Table,
  formatRelative,
  truncateUpdateId,
} from "../ui";
import { describeFailure } from "../../lib/api";
import {
  deliveryOutcome,
  formatAtomicAmount,
  settlementFromState,
} from "../../lib/present";
import { useAttempts } from "../../lib/use-api";
import { useEvidenceMap } from "../../lib/use-evidence";
import { TableSkeleton } from "../marketplace/skeletons";

const WINDOWS = [
  { value: "1", label: "Last 24 h" },
  { value: "7", label: "Last 7 d" },
  { value: "30", label: "Last 30 d" },
  { value: "0", label: "All observed" },
];

const SETTLEMENTS = [
  { value: "all", label: "Any settlement" },
  { value: "settled", label: "Settled" },
  { value: "failed", label: "Settlement failed" },
  { value: "pending", label: "In flight" },
];

/** `/scan` — Sotto-attributed activity feed (surface map 05). */
export function ScanFeed() {
  const router = useRouter();
  const attempts = useAttempts(100);
  const [query, setQuery] = useState("");
  const [windowDays, setWindowDays] = useState("7");
  const [settlement, setSettlement] = useState("all");
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const cutoff =
      windowDays === "0"
        ? 0
        : now.getTime() - Number(windowDays) * 24 * 60 * 60 * 1000;
    return (attempts.data ?? []).filter((attempt) => {
      if (Date.parse(attempt.createdAt) < cutoff) return false;
      if (
        settlement !== "all" &&
        settlementFromState(attempt.state) !== settlement
      ) {
        return false;
      }
      if (needle === "") return true;
      return [
        attempt.attemptId,
        attempt.resourceName,
        attempt.normalizedOrigin,
        attempt.state,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [attempts.data, query, windowDays, settlement, now]);

  const evidence = useEvidenceMap(
    useMemo(() => rows.slice(0, 50).map((row) => row.attemptId), [rows]),
  );

  if (attempts.loading) return <TableSkeleton />;

  return (
    <>
      <div className="app-page-head">
        <div>
          <h1 className="app-page-title">Sotto Scan</h1>
          <p className="app-page-sub">
            Payment and delivery activity observed through Sotto.
          </p>
        </div>
      </div>

      {attempts.error !== null ? (
        <div className="app-error-band" role="alert">
          <p>Feed query failed — {describeFailure(attempts.error)}</p>
          <Button onClick={attempts.reload}>Retry</Button>
        </div>
      ) : attempts.data !== null && attempts.data.length === 0 ? (
        <RestState
          title="No Sotto-attributed activity yet."
          detail="The first settled call lands here with its Canton update."
          action={<Link href="/composer">Open Composer</Link>}
        />
      ) : (
        <>
          <div className="app-toolbar">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Attempt or update ID, resource…"
              aria-label="Search attempts"
            />
            <Select
              options={WINDOWS}
              value={windowDays}
              onValueChange={setWindowDays}
            />
            <Select
              options={SETTLEMENTS}
              value={settlement}
              onValueChange={setSettlement}
            />
          </div>
          {rows.length === 0 ? (
            <RestState
              title="No attempts match these filters."
              action={
                <Button
                  onClick={() => {
                    setQuery("");
                    setSettlement("all");
                    setWindowDays("0");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table label="Attempt feed">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Resource</th>
                  <th className="sv-num">Amount</th>
                  <th>Settlement · Delivery</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((attempt) => {
                  const detail = evidence.get(attempt.attemptId);
                  return (
                    <tr
                      key={attempt.attemptId}
                      className="app-row-link"
                      onClick={() => router.push(`/scan/${attempt.attemptId}`)}
                    >
                      <td className="app-mono">
                        {formatRelative(new Date(attempt.createdAt), now)}
                      </td>
                      <td>
                        <span className="app-cell-main">
                          {attempt.resourceName}
                        </span>
                        <div className="app-cell-sub app-mono">
                          {attempt.method} {attempt.routeTemplate}
                        </div>
                      </td>
                      <td className="sv-num app-price">
                        {formatAtomicAmount(
                          attempt.amountAtomic,
                          attempt.asset,
                        )}
                      </td>
                      <td>
                        <StateChipPair
                          settlement={settlementFromState(attempt.state)}
                          delivery={deliveryOutcome(
                            detail?.delivery.status ?? "not-started",
                          )}
                        />
                      </td>
                      <td className="app-mono">
                        {detail?.settlement.updateId != null
                          ? truncateUpdateId(detail.settlement.updateId)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
