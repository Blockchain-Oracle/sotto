"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatRelative, StateChipPair, Table, truncateUpdateId } from "../ui";
import {
  deliveryOutcome,
  deriveInputFields,
  formatAtomicAmount,
  settlementFromState,
} from "../../lib/present";
import { useEvidenceMap } from "../../lib/use-evidence";
import type { PublicAttempt } from "../../lib/types";

/**
 * Request schema band. The only real schema source is the verified route
 * template: every `{parameter}` is one required string field (mirrors the
 * API's compose-assist derivation). No schema is invented beyond it.
 */
export function ResourceSchema({ routeTemplate }: { routeTemplate: string }) {
  const fields = deriveInputFields(routeTemplate);
  return (
    <div className="app-band">
      <p className="app-band-title">Request</p>
      {fields.length === 0 ? (
        <p style={{ margin: 0 }}>
          No request parameters — the verified route is called exactly as
          published.
        </p>
      ) : (
        <Table label="Request parameters">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Type</th>
              <th>Required</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field}>
                <td className="app-mono">{field}</td>
                <td>string</td>
                <td>required</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/** Recent public Sotto-attributed calls for this resource → Scan. */
export function ResourceActivity({
  attempts,
  origin,
  route,
  now,
}: {
  attempts: readonly PublicAttempt[] | null;
  origin: string;
  route: string | null;
  now: Date;
}) {
  const rows = (attempts ?? [])
    .filter(
      (attempt) =>
        attempt.normalizedOrigin === origin &&
        (route === null || attempt.routeTemplate === route),
    )
    .slice(0, 8);
  const evidence = useEvidenceMap(
    useMemo(() => rows.map((row) => row.attemptId), [rows]),
  );
  return (
    <div className="app-band">
      <p className="app-band-title">Recent activity</p>
      {rows.length === 0 ? (
        <p style={{ margin: 0 }}>
          No Sotto-attributed calls recorded for this resource yet.{" "}
          <Link href="/scan" style={{ color: "var(--lapis)" }}>
            Open Scan
          </Link>
        </p>
      ) : (
        <Table label="Recent attempts">
          <thead>
            <tr>
              <th>When</th>
              <th className="sv-num">Amount</th>
              <th>Settlement · Delivery</th>
              <th>Attempt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((attempt) => (
              <tr key={attempt.attemptId}>
                <td className="app-mono">
                  {formatRelative(new Date(attempt.createdAt), now)}
                </td>
                <td className="sv-num">
                  {formatAtomicAmount(attempt.amountAtomic, attempt.asset)}
                </td>
                <td>
                  <StateChipPair
                    settlement={settlementFromState(attempt.state)}
                    delivery={deliveryOutcome(
                      evidence.get(attempt.attemptId)?.delivery.status ??
                        "not-started",
                    )}
                  />
                </td>
                <td className="app-mono">
                  <Link href={`/scan/${attempt.attemptId}`}>
                    {truncateUpdateId(
                      attempt.attemptId.replace(/^sha256:/u, ""),
                    )}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
