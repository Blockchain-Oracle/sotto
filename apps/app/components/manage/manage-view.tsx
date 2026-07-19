"use client";

import Link from "next/link";
import { Badge, Button, RestState } from "../ui";
import { useSession } from "../../lib/session";
import { useCatalog } from "../../lib/use-api";

/**
 * `/manage` — owner inventory (surface map 03). The API exposes no
 * owner-scoped inventory read yet (no GET /v1/origins), so this surface
 * states that gap instead of inventing rows. What IS real: the public
 * catalog (which includes anything this owner published) and the Add API
 * flow.
 */
export function ManageView({ originId }: { originId?: string }) {
  const session = useSession();
  const catalog = useCatalog();

  if (session.status === "checking") return null;

  if (session.status !== "active") {
    return (
      <RestState
        title="Manage APIs needs an owner session."
        detail={
          session.status === "expired"
            ? "Your session expired — verify again to continue; nothing was lost."
            : "Connect and verify your Canton party to manage verified origins."
        }
        action={
          <Button variant="primary" onClick={session.openConnect}>
            Connect Canton wallet
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="app-page-head">
        <div>
          <h1 className="app-page-title">
            {originId === undefined ? "Manage APIs" : "Origin management"}
          </h1>
          <p className="app-page-sub">
            Personal owner inventory — one party, no organization layer.
          </p>
        </div>
        <div className="app-head-actions">
          <Link href="/add-api">
            <Button variant="primary">Add API</Button>
          </Link>
        </div>
      </div>

      <div className="app-band" style={{ borderColor: "var(--ambra)" }}>
        <p className="app-band-title">
          Not available on this API <Badge tone="ambra">501</Badge>
        </p>
        <p style={{ margin: 0 }}>
          The owner-scoped inventory read (origins, revisions, probe history)
          and the Publish / Pause / Unpublish controls have no API surface on
          this deployment yet — nothing is shown rather than something invented.
          A quarantined listing cannot be self-restored either way; that path
          stays with the operator.
        </p>
      </div>

      <div className="app-band">
        <p className="app-band-title">What works today</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Publishing a new origin end-to-end through{" "}
            <Link href="/add-api" style={{ color: "var(--lapis)" }}>
              Add API
            </Link>{" "}
            — registration, live audit, well-known origin proof, publication.
          </li>
          <li>
            Your published resources appear in the{" "}
            <Link href="/" style={{ color: "var(--lapis)" }}>
              public catalog
            </Link>
            {catalog.data !== null
              ? ` (${catalog.data.length} published in total)`
              : ""}{" "}
            with their probe-observed payment facts.
          </li>
          <li>
            Re-auditing an origin you own: run Add API against the same origin —
            registration replays idempotently and a fresh probe records a new
            revision.
          </li>
        </ul>
      </div>
    </>
  );
}
