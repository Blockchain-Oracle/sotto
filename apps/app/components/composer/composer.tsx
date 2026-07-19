"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useCatalog } from "../../lib/use-api";
import { usePurchaseRun } from "../../lib/purchase-machine";
import { useSession } from "../../lib/session";
import { eventLabel } from "../../lib/present";
import { Inspector } from "./inspector";
import { ResourceRail } from "./resource-rail";
import { TaskArea } from "./task-area";

const MOBILE_TABS = [
  { value: "resources", label: "Resources" },
  { value: "task", label: "Task" },
  { value: "execution", label: "Execution" },
] as const;

/**
 * `/composer` — the execution workspace (surface map 04/04a). Three
 * stable regions on desktop; three tabs plus a compact sticky status row
 * under 960px. Tab switches never reset the selected resource, entered
 * input, or a run in flight.
 */
export function Composer() {
  const params = useSearchParams();
  const catalog = useCatalog();
  const session = useSession();
  const { run, prepare } = usePurchaseRun();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<string>("task");

  const requested = params.get("resource");
  useEffect(() => {
    if (requested !== null) setSelectedId(requested);
  }, [requested]);

  const resource =
    (catalog.data ?? []).find((entry) => entry.listingId === selectedId) ??
    null;

  const latest = run.events.at(-1);
  const statusLine =
    run.phase === "idle"
      ? null
      : run.phase === "initiating"
        ? "Observing live 402…"
        : latest === undefined
          ? "Intent journaled"
          : eventLabel(latest.type);

  const prepareSelected = () => {
    if (resource !== null) void prepare(resource.listingId);
  };

  const regions = (
    <>
      <section
        className="app-composer-col"
        data-mobile-active={mobileTab === "resources" ? "true" : undefined}
        aria-label="Verified resources"
      >
        <ResourceRail
          catalog={catalog}
          selectedId={selectedId}
          onSelect={(listingId) => {
            setSelectedId(listingId);
            setMobileTab("task");
          }}
        />
      </section>
      <section
        className="app-composer-col"
        data-mobile-active={mobileTab === "task" ? "true" : undefined}
        aria-label="Task"
      >
        <TaskArea
          resource={resource}
          run={run}
          sessionActive={session.status === "active"}
          onPrepare={prepareSelected}
          onConnect={session.openConnect}
        />
      </section>
      <section
        className="app-composer-col"
        data-mobile-active={mobileTab === "execution" ? "true" : undefined}
        aria-label="Execution inspector"
      >
        <Inspector resource={resource} run={run} />
      </section>
    </>
  );

  return (
    <div className="app-composer">
      <div className="app-composer-mobilebar">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className="app-tab"
            data-active={mobileTab === tab.value ? "true" : undefined}
            onClick={() => setMobileTab(tab.value)}
            style={{ background: "none", border: 0, cursor: "pointer" }}
          >
            {tab.label}
          </button>
        ))}
        {statusLine === null ? null : (
          <span className="app-composer-status">{statusLine}</span>
        )}
      </div>
      {regions}
    </div>
  );
}
