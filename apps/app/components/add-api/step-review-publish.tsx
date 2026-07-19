"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, CopyChip, formatUtc } from "../ui";
import { ApiError, apiRequest, describeFailure } from "../../lib/api";
import { formatAtomicAmount } from "../../lib/present";
import type { CatalogResource } from "../../lib/types";
import type { AddApiDraft } from "./draft";

/**
 * Steps 4–5 — Review and publish. Presentation fields sit visibly apart
 * from the LOCKED observed payment facts: price and recipient can only
 * change at the endpoint and be re-audited, never edited here.
 */
export function StepReviewPublish({
  draft,
  setDraft,
  disabled,
  onFinished,
}: {
  draft: AddApiDraft;
  setDraft: (draft: AddApiDraft) => void;
  disabled: boolean;
  onFinished: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<CatalogResource | null>(null);

  const observation = draft.observation;
  const result = observation?.result;

  const publish = async () => {
    if (
      observation === null ||
      result?.revisionId === undefined ||
      draft.proofId === null
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await apiRequest<{ resource: CatalogResource }>(
        "/v1/resources/publish",
        {
          method: "POST",
          body: {
            resourceId: observation.resourceId,
            resourceRevisionId: result.revisionId,
            originProofId: draft.proofId,
            expectedListingVersion: 0,
          },
        },
      );
      setPublished(outcome.resource);
      setDraft({ ...draft, step: 5 });
      onFinished();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setError(
          `${failure.detail} (publication-stale — the listing already moved)`,
        );
      } else if (failure instanceof ApiError && failure.status === 422) {
        setError(
          `${failure.detail} (publication-ineligible — re-run the proof or audit)`,
        );
      } else {
        setError(describeFailure(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  if (published !== null) {
    return (
      <div className="app-band">
        <p className="app-band-title">Published</p>
        <p style={{ marginTop: 0 }}>
          {draft.origin?.normalizedOrigin} now lists 1 verified resource at
          revision{" "}
          <CopyChip value={published.resourceRevisionId} kind="update" />.
        </p>
        <div
          className="app-head-actions"
          style={{ justifyContent: "flex-start" }}
        >
          <Link href={`/resources/${published.listingId}`}>
            <Button variant="primary">Open public listing</Button>
          </Link>
          <Link href="/manage">
            <Button>Manage APIs</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (observation === null || result === undefined) {
    return (
      <div className="app-error-band" role="alert">
        <p>The audit result is missing — return to the audit step.</p>
        <Button onClick={() => setDraft({ ...draft, step: 2 })}>
          Back to audit
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="app-band">
        <p className="app-band-title">Presentation (provider-editable)</p>
        <dl className="app-kv">
          <dt>Name</dt>
          <dd>{result.name ?? draft.resourceName}</dd>
          <dt>Description</dt>
          <dd>{result.description ?? draft.resourceDescription}</dd>
        </dl>
        <p className="app-note">
          Changing presentation requires a fresh audit — the published revision
          is exactly what the probe observed.
        </p>
      </div>

      <div className="app-locked">
        <p className="app-locked-title">Locked · observed from the live 402</p>
        <dl className="app-kv">
          <dt>Route</dt>
          <dd>
            {observation.method} {observation.routeTemplate}
          </dd>
          <dt>Price</dt>
          <dd>
            {result.amountAtomic !== undefined && result.asset !== undefined
              ? formatAtomicAmount(result.amountAtomic, result.asset)
              : "—"}
          </dd>
          <dt>Recipient</dt>
          <dd>
            {result.recipient === undefined ? (
              "—"
            ) : (
              <CopyChip value={result.recipient} kind="party" />
            )}
          </dd>
          <dt>Network</dt>
          <dd>{result.network ?? "—"}</dd>
          <dt>Transfer method</dt>
          <dd>{result.transferMethod ?? "—"}</dd>
          <dt>Observed</dt>
          <dd>{formatUtc(new Date(observation.observedAt))}</dd>
        </dl>
        <p className="app-note">
          Editing price or recipient in Sotto is impossible — change them at the
          endpoint, then re-audit.
        </p>
      </div>

      {error !== null ? (
        <div className="app-error-band" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="app-band">
        <p className="app-band-title">Publish</p>
        <p style={{ marginTop: 0 }}>
          Publishing lists 1 resource from{" "}
          <span className="app-mono">{draft.origin?.normalizedOrigin}</span> at
          revision{" "}
          {result.revisionId === undefined ? (
            "—"
          ) : (
            <CopyChip value={result.revisionId} kind="update" />
          )}{" "}
          with the locked payment facts above.
        </p>
        <div
          className="app-head-actions"
          style={{ justifyContent: "flex-start" }}
        >
          <Button
            variant="ghost"
            onClick={() => setDraft({ ...draft, step: 3 })}
          >
            Back
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={disabled || draft.proofId === null}
            onClick={() => void publish()}
          >
            Publish resource
          </Button>
        </div>
      </div>
    </div>
  );
}
