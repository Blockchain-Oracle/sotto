"use client";

import { useEffect, useState } from "react";

import { Button } from "../ui";
import { useSession } from "../../lib/session";
import {
  EMPTY_DRAFT,
  STEPS,
  clearDraft,
  readDraft,
  writeDraft,
  type AddApiDraft,
} from "./draft";
import { StepEndpoint } from "./step-endpoint";
import { StepAudit } from "./step-audit";
import { StepVerify } from "./step-verify";
import { StepReviewPublish } from "./step-review-publish";

/**
 * `/add-api` — audit-and-publication workflow (surface map 03): one
 * full-width work area with a narrow progress rail. Resumable: the
 * non-secret draft survives reloads and session expiry.
 */
export function AddApiFlow() {
  const session = useSession();
  const [draft, setDraftState] = useState<AddApiDraft>(EMPTY_DRAFT);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setDraftState(readDraft());
    setRestored(true);
  }, []);

  const setDraft = (next: AddApiDraft) => {
    setDraftState(next);
    writeDraft(next);
  };

  if (!restored) return null;

  const needsSession = session.status !== "active";

  return (
    <>
      <div className="app-page-head">
        <div>
          <h1 className="app-page-title">Add API</h1>
          <p className="app-page-sub">
            Audit an already-payable endpoint, prove origin control, and publish
            the verified resource.
          </p>
        </div>
        {draft.step > 1 ? (
          <div className="app-head-actions">
            <Button
              variant="ghost"
              onClick={() => {
                clearDraft();
                setDraftState(EMPTY_DRAFT);
              }}
            >
              Discard draft
            </Button>
          </div>
        ) : null}
      </div>

      {needsSession ? (
        <div className="app-band" style={{ borderColor: "var(--ambra)" }}>
          <p style={{ margin: 0 }}>
            {session.status === "expired"
              ? "Your owner session expired — the audit draft is preserved. Verify again to continue."
              : "Publishing needs an owner session backed by a Canton party."}{" "}
          </p>
          <div style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={session.openConnect}>
              Connect Canton wallet
            </Button>
          </div>
        </div>
      ) : null}

      <div className="app-flow">
        <nav className="app-flow-rail" aria-label="Progress">
          {STEPS.map((label, index) => {
            const number = (index + 1) as AddApiDraft["step"];
            return (
              <div
                key={label}
                className="app-step"
                data-state={
                  number === draft.step
                    ? "current"
                    : number < draft.step
                      ? "done"
                      : "todo"
                }
              >
                <span className="app-step-mark" aria-hidden="true" />
                <span>{label}</span>
              </div>
            );
          })}
        </nav>
        <div>
          {draft.step === 1 ? (
            <StepEndpoint
              draft={draft}
              setDraft={setDraft}
              disabled={needsSession}
            />
          ) : draft.step === 2 ? (
            <StepAudit
              draft={draft}
              setDraft={setDraft}
              disabled={needsSession}
            />
          ) : draft.step === 3 ? (
            <StepVerify
              draft={draft}
              setDraft={setDraft}
              disabled={needsSession}
            />
          ) : (
            <StepReviewPublish
              draft={draft}
              setDraft={setDraft}
              disabled={needsSession}
              onFinished={() => {
                clearDraft();
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
