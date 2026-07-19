"use client";

import { CopyChip, formatUtc } from "../ui";
import type { StatsResponse } from "../../lib/types";

/**
 * Rail-health band: dependency truths only, from the real /v1/stats
 * rail-health block. `—` marks measures this deployment cannot report
 * (external explorer lag, end-to-end smoke) — they are never invented.
 */
export function RailHealthBand({
  rail,
  sourceCommit,
}: {
  rail: StatsResponse["railHealth"];
  sourceCommit: string;
}) {
  return (
    <div className="app-band">
      <p className="app-band-title">Rail health</p>
      <dl className="app-kv">
        <dt>Sotto API</dt>
        <dd>answering (this page loaded from it)</dd>
        <dt>Statistics store</dt>
        <dd>{rail.database}</dd>
        <dt>Purchase worker</dt>
        <dd>
          {rail.worker.state === "never-seen"
            ? "never seen — settlements will not progress"
            : `heartbeat ${
                rail.worker.heartbeatAgeMilliseconds === null
                  ? "age unknown"
                  : `${Math.round(rail.worker.heartbeatAgeMilliseconds / 1000)}s ago`
              } (${formatUtc(new Date(rail.worker.beatAt))})`}
        </dd>
        <dt>Canton DevNet (Five North)</dt>
        <dd>
          {rail.fiveNorthConfigured
            ? "configured on this deployment"
            : "not configured — purchases cannot settle"}
        </dd>
        <dt>Explorer indexing lag</dt>
        <dd>— (no external index feed on this deployment)</dd>
        <dt>Last end-to-end smoke</dt>
        <dd>— (not recorded by this API)</dd>
        <dt>API source commit</dt>
        <dd>
          <CopyChip value={sourceCommit} kind="update" />
        </dd>
      </dl>
    </div>
  );
}
