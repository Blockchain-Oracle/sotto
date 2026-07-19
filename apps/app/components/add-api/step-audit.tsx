"use client";

import { useState } from "react";

import { Button, Field, Input, formatUtc } from "../ui";
import { ApiError, apiRequest, describeFailure } from "../../lib/api";
import type { ProbeHealth, ProbeObservation } from "../../lib/types";
import type { AddApiDraft } from "./draft";

type CheckState = "pending" | "passed" | "failed";

type CheckRow = Readonly<{
  label: string;
  state: CheckState;
  detail?: string;
  at?: string;
}>;

function checklist(draft: AddApiDraft): readonly CheckRow[] {
  const health = draft.health;
  const observation = draft.observation;
  const observedAt = health?.observedAt ?? observation?.observedAt;
  if (health === null && observation === null) {
    return [
      { label: "Origin reachable over HTTPS", state: "pending" },
      { label: "Live endpoint returned 402", state: "pending" },
      { label: "x402 v2 challenge parsed", state: "pending" },
      { label: "Canton network and exact scheme supported", state: "pending" },
      {
        label: "Recipient, price, and transfer method verified",
        state: "pending",
      },
    ];
  }
  const transportFailed =
    health !== null &&
    health.result.kind === "failing" &&
    health.result.domain === "transport";
  const verified = observation?.result.kind === "verified-x402";
  const got402 = observation?.httpStatus === 402 || verified;
  const failCode =
    health !== null && health.result.kind === "failing"
      ? `${health.result.domain ?? ""} · ${health.result.code ?? ""}`
      : undefined;
  const row = (
    label: string,
    passed: boolean,
    failed: boolean,
    detail?: string,
  ): CheckRow => ({
    label,
    state: passed ? "passed" : failed ? "failed" : "pending",
    ...(detail === undefined ? {} : { detail }),
    ...(observedAt === undefined ? {} : { at: observedAt }),
  });
  return [
    row(
      "Origin reachable over HTTPS",
      !transportFailed,
      transportFailed,
      transportFailed ? failCode : undefined,
    ),
    row(
      "Live endpoint returned 402",
      got402,
      !got402 && !transportFailed,
      !got402 && !transportFailed
        ? `The endpoint answered ${observation?.httpStatus ?? health?.result.httpStatus ?? "no 402"} instead of an x402 challenge.`
        : undefined,
    ),
    row("x402 v2 challenge parsed", verified, got402 && !verified, failCode),
    row(
      "Canton network and exact scheme supported",
      verified,
      got402 && !verified,
      verified ? undefined : failCode,
    ),
    row(
      "Recipient, price, and transfer method verified",
      verified,
      got402 && !verified,
    ),
  ];
}

/** Step 2 — Audit live API: one real server-side probe per run. */
export function StepAudit({
  draft,
  setDraft,
  disabled,
}: {
  draft: AddApiDraft;
  setDraft: (draft: AddApiDraft) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = async () => {
    if (draft.origin === null) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await apiRequest<{
        observation: ProbeObservation;
        health: ProbeHealth;
      }>(`/v1/origins/${draft.origin.originId}/probe`, {
        method: "POST",
        body: {
          routeTemplate: draft.routeTemplate,
          name: draft.resourceName.trim(),
          description: draft.resourceDescription.trim(),
        },
      });
      setDraft({
        ...draft,
        observation: outcome.observation,
        health: outcome.health,
        probeFailure: null,
      });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422) {
        const health = failure.body.health as ProbeHealth | undefined;
        setDraft({
          ...draft,
          observation: null,
          health: health ?? null,
          probeFailure: { code: failure.code, detail: failure.detail },
        });
      } else {
        setError(describeFailure(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  const rows = checklist(draft);
  const verified = draft.observation?.result.kind === "verified-x402";

  return (
    <div>
      <Field label="Route to audit" htmlFor="audit-route">
        <Input
          id="audit-route"
          mono
          value={draft.routeTemplate}
          onChange={(event) =>
            setDraft({ ...draft, routeTemplate: event.target.value })
          }
        />
      </Field>
      <Field label="Resource name" htmlFor="audit-name">
        <Input
          id="audit-name"
          value={draft.resourceName}
          onChange={(event) =>
            setDraft({ ...draft, resourceName: event.target.value })
          }
          maxLength={128}
        />
      </Field>
      <Field label="Resource description" htmlFor="audit-description">
        <Input
          id="audit-description"
          value={draft.resourceDescription}
          onChange={(event) =>
            setDraft({ ...draft, resourceDescription: event.target.value })
          }
          maxLength={512}
        />
      </Field>
      {error !== null ? (
        <div className="app-error-band" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <div style={{ margin: "12px 0" }}>
        <Button
          variant="primary"
          loading={busy}
          disabled={
            disabled ||
            draft.routeTemplate.trim() === "" ||
            draft.resourceName.trim() === ""
          }
          onClick={() => void probe()}
        >
          Run live audit
        </Button>
      </div>

      <div className="app-band">
        <p className="app-band-title">Server-observed checks</p>
        <ul className="app-checklist">
          {rows.map((check) => (
            <li
              key={check.label}
              className="app-check-row"
              data-state={check.state}
            >
              <span className="app-check-state">{check.state}</span>
              <span>
                {check.label}
                {check.detail === undefined ? null : (
                  <span className="app-cell-sub"> — {check.detail}</span>
                )}
              </span>
              {check.at === undefined ? null : (
                <span className="app-check-when">
                  {formatUtc(new Date(check.at))}
                </span>
              )}
            </li>
          ))}
        </ul>
        {draft.probeFailure !== null ? (
          <p className="sv-field-error" role="alert">
            {draft.probeFailure.detail}
          </p>
        ) : null}
      </div>

      <div className="app-head-actions">
        <Button variant="ghost" onClick={() => setDraft({ ...draft, step: 1 })}>
          Back
        </Button>
        <Button
          variant="primary"
          disabled={!verified}
          onClick={() => setDraft({ ...draft, step: 3 })}
        >
          Continue to origin verification
        </Button>
      </div>
    </div>
  );
}
