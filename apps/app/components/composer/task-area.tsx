"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Field, Input, RestState, Textarea } from "../ui";
import { ApiError, describeFailure, apiRequest } from "../../lib/api";
import { deriveInputFields, formatAtomicAmount } from "../../lib/present";
import type { CatalogResource } from "../../lib/types";
import type { PurchaseRun } from "../../lib/purchase-machine";
import { ProposalBlock } from "./proposal-block";
import { ResultRecord } from "./result-record";

/**
 * Composer task area (surface map 04): identity strip, schema-aware input
 * derived from the verified route template, optional model-assisted
 * inputs, Prepare call, then the immutable proposal and the result
 * record. Input never reaches payment authority — the API binds the
 * verified route itself.
 */
export function TaskArea({
  resource,
  run,
  sessionActive,
  onPrepare,
  onConnect,
}: {
  resource: CatalogResource | null;
  run: PurchaseRun;
  sessionActive: boolean;
  onPrepare: () => void;
  onConnect: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [task, setTask] = useState("");
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistOff, setAssistOff] = useState(false);

  useEffect(() => {
    setValues({});
    setAssistError(null);
  }, [resource?.listingId]);

  if (resource === null) {
    return (
      <RestState
        title="Choose a paid resource"
        detail="Select a verified marketplace resource from the rail to prepare an exact paid call."
        action={<Link href="/">Browse the marketplace</Link>}
      />
    );
  }

  const fields = deriveInputFields(resource.routeTemplate);
  const fieldsMissing = fields.some(
    (field) => (values[field] ?? "").trim() === "",
  );

  const assist = async () => {
    setAssistBusy(true);
    setAssistError(null);
    try {
      const outcome = await apiRequest<{
        input: Record<string, string>;
        fields: readonly string[];
      }>("/v1/compose-assist", {
        method: "POST",
        body: { listingId: resource.listingId, task },
      });
      setValues(outcome.input);
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        setAssistOff(true);
      } else {
        setAssistError(describeFailure(error));
      }
    } finally {
      setAssistBusy(false);
    }
  };

  return (
    <div>
      <div className="app-band">
        <p className="app-band-title">Selected resource</p>
        <div className="app-rail-line">
          <span className="app-cell-main">
            {resource.providerDisplayName} · {resource.name}
          </span>
          <span className="app-price">
            {formatAtomicAmount(resource.amountAtomic, resource.asset)}
          </span>
        </div>
        <div className="app-rail-route">
          {resource.method} {resource.normalizedOrigin}
          {resource.routeTemplate}
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="app-note">
          This resource takes no request parameters — the verified route is
          called exactly as published.
        </p>
      ) : (
        <>
          {fields.map((field) => (
            <Field key={field} label={field} htmlFor={`task-${field}`}>
              <Input
                id={`task-${field}`}
                mono
                value={values[field] ?? ""}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
          <p className="app-note">
            Route parameters cannot be bound by the Composer on this deployment
            yet — the API refuses parameterized routes with its
            route-parameters-unsupported answer. Choose a parameterless resource
            to execute.
          </p>
        </>
      )}

      {assistOff ? (
        <p className="app-note">
          Model-assisted inputs are off — no assistant is configured on this
          deployment. Compose the request by hand.
        </p>
      ) : fields.length > 0 ? (
        <Field
          label="Model-assisted inputs"
          htmlFor="task-nl"
          hint="Describe the task; the configured model fills the fields above."
          {...(assistError === null ? {} : { error: assistError })}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <Textarea
              id="task-nl"
              rows={2}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              loading={assistBusy}
              disabled={task.trim() === ""}
              onClick={() => void assist()}
            >
              Fill fields
            </Button>
          </div>
        </Field>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {sessionActive ? (
          <Button
            variant="primary"
            loading={run.phase === "initiating"}
            disabled={
              run.phase === "streaming" || (fields.length > 0 && fieldsMissing)
            }
            onClick={onPrepare}
          >
            Prepare call
          </Button>
        ) : (
          <Button variant="primary" onClick={onConnect}>
            Connect Canton wallet to prepare
          </Button>
        )}
      </div>

      {run.failure !== null && run.phase === "failed" ? (
        <div className="app-error-band" role="alert" style={{ marginTop: 14 }}>
          <p>
            {run.sessionLost
              ? `Owner session expired — ${run.failure.detail} Your draft stays on this screen.`
              : run.failure.detail}
          </p>
        </div>
      ) : null}

      {run.priceConflict !== null ? (
        <div
          className="app-band"
          style={{ borderColor: "var(--ambra)", marginTop: 14 }}
        >
          <p className="app-band-title">Live 402 differs from the index</p>
          <dl className="app-kv">
            <dt>Indexed price</dt>
            <dd>
              {formatAtomicAmount(
                run.priceConflict.indexed.amountAtomic,
                resource.asset,
              )}
            </dd>
            <dt>Live 402 price</dt>
            <dd>
              {formatAtomicAmount(
                run.priceConflict.observed.amountAtomic,
                resource.asset,
              )}
            </dd>
          </dl>
          <p className="app-note">
            The flow stopped with both facts — nothing was paid at the new
            price. Re-probe the resource, then retry deliberately.
          </p>
        </div>
      ) : null}

      {run.created !== null ? (
        <ProposalBlock resource={resource} run={run} values={values} />
      ) : null}
      {run.created !== null ? <ResultRecord run={run} /> : null}
    </div>
  );
}
