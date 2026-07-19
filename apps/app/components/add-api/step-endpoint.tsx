"use client";

import { useState } from "react";

import { Button, Field, Input } from "../ui";
import { ApiError, apiRequest, describeFailure } from "../../lib/api";
import type { RegisteredOrigin } from "../../lib/types";
import type { AddApiDraft } from "./draft";

function splitEndpoint(raw: string): { origin: string; route: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return {
    origin: parsed.origin,
    route: parsed.pathname === "" ? "/" : parsed.pathname,
  };
}

/** Step 1 — Enter endpoint (surface map 03). */
export function StepEndpoint({
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
  const [conflict, setConflict] = useState(false);

  const parts = splitEndpoint(draft.endpointUrl.trim());
  const clientInvalid = draft.endpointUrl.trim() !== "" && parts === null;

  const register = async () => {
    if (parts === null) return;
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      const outcome = await apiRequest<{
        origin: RegisteredOrigin;
        outcome: string;
      }>("/v1/origins", {
        method: "POST",
        body: {
          originUrl: parts.origin,
          providerDisplayName: draft.providerName.trim(),
        },
      });
      setDraft({
        ...draft,
        step: 2,
        origin: outcome.origin,
        routeTemplate: parts.route,
        observation: null,
        health: null,
        probeFailure: null,
      });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setConflict(true);
      } else {
        setError(describeFailure(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Field
        label="Provider display name"
        htmlFor="add-provider"
        hint="Shown on the public marketplace listing."
      >
        <Input
          id="add-provider"
          value={draft.providerName}
          onChange={(event) =>
            setDraft({ ...draft, providerName: event.target.value })
          }
          maxLength={128}
        />
      </Field>
      <Field
        label="HTTPS endpoint"
        htmlFor="add-endpoint"
        hint="The endpoint must already return an x402 payment challenge."
        {...(clientInvalid
          ? {
              error:
                "Only public HTTPS URLs can carry paid resources — local, tunnel, and preview origins are not auditable.",
            }
          : error !== null
            ? { error }
            : {})}
      >
        <Input
          id="add-endpoint"
          mono
          value={draft.endpointUrl}
          onChange={(event) =>
            setDraft({ ...draft, endpointUrl: event.target.value })
          }
          placeholder="https://api.example.com/v1/paid-route"
        />
      </Field>
      {conflict ? (
        <div className="app-error-band" role="alert">
          <p>
            Another owner already registered this origin. Prove control of a
            different origin, or contact the operator.
          </p>
        </div>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          loading={busy}
          disabled={
            disabled || parts === null || draft.providerName.trim() === ""
          }
          onClick={() => void register()}
        >
          Audit API
        </Button>
      </div>
      <p className="app-note">
        Integration source for Canton x402 challenges lives in the Sotto
        repository README — this flow audits, it does not add middleware.
      </p>
    </div>
  );
}
