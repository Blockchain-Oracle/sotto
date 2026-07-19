"use client";

import { useState } from "react";

import { Button, CodeBlock, CopyChip, Deadline, Select } from "../ui";
import { ApiError, apiRequest, describeFailure } from "../../lib/api";
import type { ProofChallenge, ProofVerified } from "../../lib/types";
import type { AddApiDraft } from "./draft";

const METHODS = [
  { value: "well-known", label: "Well-known file" },
  { value: "dns", label: "DNS record" },
];

/** Step 3 — Verify origin control with the real well-known proof. */
export function StepVerify({
  draft,
  setDraft,
  disabled,
}: {
  draft: AddApiDraft;
  setDraft: (draft: AddApiDraft) => void;
  disabled: boolean;
}) {
  const [method, setMethod] = useState("well-known");
  const [challenge, setChallenge] = useState<ProofChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dnsUnsupported, setDnsUnsupported] = useState(false);

  const issue = async () => {
    if (draft.origin === null) return;
    setBusy(true);
    setError(null);
    setDnsUnsupported(false);
    try {
      const outcome = await apiRequest<ProofChallenge>(
        `/v1/origins/${draft.origin.originId}/proof-challenge`,
        {
          method: "POST",
          body: method === "well-known" ? {} : { method },
        },
      );
      setChallenge(outcome);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 501) {
        setDnsUnsupported(true);
      } else {
        setError(describeFailure(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (draft.origin === null) return;
    setChecking(true);
    setError(null);
    try {
      const outcome = await apiRequest<ProofVerified>(
        `/v1/origins/${draft.origin.originId}/proof-verify`,
        { method: "POST", body: {} },
      );
      setDraft({
        ...draft,
        step: 4,
        proofId: outcome.proofId,
        proofExpiresAt: outcome.expiresAt,
      });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setChallenge(null);
        setError(
          `${failure.detail} The previous challenge is gone — issue a new one.`,
        );
      } else {
        setError(describeFailure(failure));
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div className="app-band">
        <p className="app-band-title">Origin under verification</p>
        <p className="app-mono" style={{ margin: 0 }}>
          {draft.origin?.normalizedOrigin ?? "—"}
        </p>
      </div>

      <div className="app-toolbar">
        <Select options={METHODS} value={method} onValueChange={setMethod} />
        <Button
          variant="primary"
          loading={busy}
          disabled={disabled}
          onClick={() => void issue()}
        >
          Issue proof challenge
        </Button>
      </div>

      {dnsUnsupported ? (
        <div className="app-band" style={{ borderColor: "var(--ambra)" }}>
          <p style={{ margin: 0 }}>
            DNS-record proofs are not implemented on this API (it answers 501) —
            nothing is assumed proven. Use the well-known file method.
          </p>
        </div>
      ) : null}

      {error !== null ? (
        <div className="app-error-band" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {challenge !== null ? (
        <div className="app-band">
          <p className="app-band-title">Serve this token</p>
          <dl className="app-kv">
            <dt>Token</dt>
            <dd>
              <CopyChip value={challenge.token} kind="update" />
            </dd>
            <dt>At URL</dt>
            <dd>
              <CopyChip value={challenge.wellKnownUrl} />
            </dd>
            <dt>Challenge expires</dt>
            <dd>
              <Deadline until={new Date(challenge.expiresAt)} />
            </dd>
          </dl>
          <CodeBlock label="EXPECTED RESPONSE BODY" code={challenge.token} />
          <div style={{ marginTop: 10 }}>
            <Button
              variant="primary"
              loading={checking}
              onClick={() => void verify()}
            >
              Check verification
            </Button>
          </div>
        </div>
      ) : null}

      <div className="app-head-actions">
        <Button variant="ghost" onClick={() => setDraft({ ...draft, step: 2 })}>
          Back to audit
        </Button>
      </div>
    </div>
  );
}
