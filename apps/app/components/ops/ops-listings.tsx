"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Field,
  Input,
  RestState,
  Table,
  formatUtc,
} from "../ui";
import { apiOrigin } from "../../lib/api";
import { healthLabel } from "../../lib/present";
import type { OpsListing } from "../../lib/types";
import { TableSkeleton } from "../marketplace/skeletons";
import { OpsConfirm, type OpsCommand } from "./ops-confirm";

const TOKEN_KEY = "sotto-ops-token";

type QueueState =
  | Readonly<{ phase: "idle" | "loading" }>
  | Readonly<{ phase: "loaded"; listings: readonly OpsListing[] }>
  | Readonly<{ phase: "failed"; status: number; detail: string }>;

async function opsFetch(
  token: string,
  path: string,
  method: "GET" | "POST",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${apiOrigin()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

/**
 * `/ops/listings` — internal operator queue over /v1/ops/* behind the
 * operator bearer token (sessionStorage only; never a cookie). Anything
 * the API answers 501 for renders as designed not-implemented.
 */
export function OpsListings() {
  const [token, setToken] = useState("");
  const [entered, setEntered] = useState(false);
  const [queue, setQueue] = useState<QueueState>({ phase: "idle" });
  const [confirm, setConfirm] = useState<OpsCommand | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored !== null) {
        setToken(stored);
        setEntered(true);
      }
    } catch {
      // Token entry is required again.
    }
  }, []);

  const load = useCallback(async (bearer: string) => {
    setQueue({ phase: "loading" });
    try {
      const { status, body } = await opsFetch(
        bearer,
        "/v1/ops/listings",
        "GET",
      );
      if (status === 200) {
        setQueue({
          phase: "loaded",
          listings: (body.listings as OpsListing[] | undefined) ?? [],
        });
      } else {
        setQueue({
          phase: "failed",
          status,
          detail:
            typeof body.detail === "string"
              ? body.detail
              : `The operator API answered ${status}.`,
        });
      }
    } catch {
      setQueue({
        phase: "failed",
        status: 0,
        detail: "The Sotto API did not answer the operator query.",
      });
    }
  }, []);

  useEffect(() => {
    if (entered && token !== "") void load(token);
  }, [entered, token, load]);

  const act = async () => {
    if (confirm === null) return;
    setActionError(null);
    const { status, body } = await opsFetch(
      token,
      `/v1/ops/listings/${confirm.listing.listingId}/${confirm.action}`,
      "POST",
    );
    if (status === 200) {
      setConfirm(null);
      void load(token);
    } else {
      setActionError(
        typeof body.detail === "string"
          ? body.detail
          : `The command failed with ${status}; the listing state is unchanged.`,
      );
    }
  };

  if (!entered) {
    return (
      <div style={{ maxWidth: 480 }}>
        <Field
          label="Operator token"
          htmlFor="ops-token"
          hint="Held in sessionStorage for this tab only. Owner sessions do not grant operator review."
        >
          <Input
            id="ops-token"
            mono
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          disabled={token.trim() === ""}
          onClick={() => {
            try {
              sessionStorage.setItem(TOKEN_KEY, token.trim());
            } catch {
              // Session-only entry still works.
            }
            setToken(token.trim());
            setEntered(true);
          }}
        >
          Open queue
        </Button>
      </div>
    );
  }

  if (queue.phase === "failed") {
    return (
      <div className="app-error-band" role="alert">
        <p>
          {queue.detail}
          {queue.status === 401 ? " Check the operator token." : ""}
        </p>
        <Button
          onClick={() => {
            setEntered(false);
            try {
              sessionStorage.removeItem(TOKEN_KEY);
            } catch {
              // Nothing stored.
            }
          }}
        >
          Re-enter token
        </Button>
      </div>
    );
  }

  if (queue.phase !== "loaded") {
    return <TableSkeleton rows={5} />;
  }

  return (
    <>
      {queue.listings.length === 0 ? (
        <RestState
          title="The moderation queue is empty."
          detail="Listings appear here when probes fail or reports arrive."
        />
      ) : (
        <Table label="Listing queue">
          <thead>
            <tr>
              <th>Origin / provider</th>
              <th>Resource</th>
              <th>State</th>
              <th>Latest health</th>
              <th aria-label="Commands" />
            </tr>
          </thead>
          <tbody>
            {queue.listings.map((listing) => (
              <tr key={listing.listingId}>
                <td>
                  <span className="app-cell-main">
                    {listing.providerDisplayName}
                  </span>
                  <div className="app-cell-sub app-mono">
                    {listing.normalizedOrigin}
                  </div>
                </td>
                <td className="app-mono">
                  {listing.method} {listing.routeTemplate}
                </td>
                <td>
                  <Badge
                    tone={listing.state === "quarantined" ? "rosso" : "neutral"}
                  >
                    {listing.state}
                  </Badge>
                </td>
                <td>
                  {listing.latestHealthStatus === null
                    ? "—"
                    : `${healthLabel(listing.latestHealthStatus)} · ${
                        listing.latestHealthObservedAt === null
                          ? ""
                          : formatUtc(new Date(listing.latestHealthObservedAt))
                      }`}
                </td>
                <td>
                  {listing.state === "published" ? (
                    <Button
                      variant="danger"
                      onClick={() =>
                        setConfirm({ listing, action: "quarantine" })
                      }
                    >
                      Quarantine
                    </Button>
                  ) : listing.state === "quarantined" ? (
                    <Button
                      onClick={() => setConfirm({ listing, action: "restore" })}
                    >
                      Restore
                    </Button>
                  ) : (
                    <span className="app-cell-sub">No transition</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div className="app-band" style={{ marginTop: 16 }}>
        <p className="app-band-title">
          Attempt review <Badge tone="ambra">501</Badge>
        </p>
        <p style={{ margin: 0 }}>
          Attempt-level operator review has no data-layer support yet — the API
          answers 501 and nothing is marked reviewed.
        </p>
      </div>

      <OpsConfirm
        confirm={confirm}
        actionError={actionError}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void act()}
      />
    </>
  );
}
