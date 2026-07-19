"use client";

import { useState } from "react";

import { Button, CopyChip, Field, Input } from "../ui";
import { apiRequest, describeFailure } from "../../lib/api";
import { useSession } from "../../lib/session";
import type { HostedOnboarding } from "../../lib/types";

type FundState =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "pending" }>
  | Readonly<{ phase: "funded"; updateId: string }>
  | Readonly<{ phase: "already-funded" }>
  | Readonly<{ phase: "failed"; detail: string }>;

/**
 * Hosted onboarding: POST /v1/onboarding/hosted creates a real signer-held
 * wallet and party on Five North and binds the session cookie; the funding
 * card then calls the real tap proxy and shows exactly what it answered —
 * a Canton updateId, alreadyFunded, or the upstream failure. Nothing here
 * simulates settlement or balances.
 */
export function HostedPath({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const session = useSession();
  const [hint, setHint] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<HostedOnboarding | null>(null);
  const [fund, setFund] = useState<FundState>({ phase: "idle" });

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await apiRequest<HostedOnboarding>(
        "/v1/onboarding/hosted",
        { method: "POST", body: { ownerHint: hint.trim() } },
      );
      setCreated(result);
      session.established({
        partyId: result.partyId,
        walletLabel: hint.trim() === "" ? "Hosted wallet" : hint.trim(),
        walletId: result.walletId,
        walletUrl: result.walletUrl,
        fingerprint: result.fingerprint,
        expiresAt: result.session.expiresAt,
      });
    } catch (error) {
      setCreateError(describeFailure(error));
    } finally {
      setCreating(false);
    }
  };

  const requestFunds = async () => {
    if (created === null) return;
    setFund({ phase: "pending" });
    try {
      const body = await apiRequest<Record<string, unknown>>(
        `/v1/onboarding/hosted/${created.walletId}/fund`,
        { method: "POST", body: {} },
      );
      if (typeof body.updateId === "string") {
        setFund({ phase: "funded", updateId: body.updateId });
      } else if (body.alreadyFunded === true) {
        setFund({ phase: "already-funded" });
      } else {
        setFund({
          phase: "failed",
          detail: "The tap answered without an updateId. Inspect the signer.",
        });
      }
    } catch (error) {
      setFund({ phase: "failed", detail: describeFailure(error) });
    }
  };

  if (created === null) {
    return (
      <div>
        <Field
          label="Wallet name"
          htmlFor="hosted-hint"
          hint="Names the hosted wallet; printable characters, up to 64."
          {...(createError === null ? {} : { error: createError })}
        >
          <Input
            id="hosted-hint"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="e.g. abu-devnet"
            maxLength={64}
          />
        </Field>
        <div className="app-head-actions" style={{ marginTop: 14 }}>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            loading={creating}
            disabled={hint.trim() === ""}
            onClick={() => void create()}
          >
            Create wallet on DevNet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <dl className="app-kv" style={{ marginTop: 8 }}>
        <dt>Party ID</dt>
        <dd>
          <CopyChip value={created.partyId} kind="party" />
        </dd>
        {created.fingerprint === null ? null : (
          <>
            <dt>Key fingerprint</dt>
            <dd>
              <CopyChip value={created.fingerprint} kind="update" />
            </dd>
          </>
        )}
      </dl>
      <div className="app-band" style={{ marginTop: 14 }}>
        <p className="app-band-title">Fund on DevNet</p>
        <p className="app-note" style={{ marginTop: 0 }}>
          Test funds — not real money. The tap submits a real Canton DevNet
          transaction; the result below is exactly what it answered.
        </p>
        {fund.phase === "funded" ? (
          <dl className="app-kv" style={{ marginTop: 10 }}>
            <dt>Canton update</dt>
            <dd>
              <CopyChip value={fund.updateId} kind="update" />
            </dd>
          </dl>
        ) : fund.phase === "already-funded" ? (
          <p style={{ margin: "10px 0 0" }}>
            Already funded — the durable tap journal recorded an earlier tap for
            this wallet.
          </p>
        ) : fund.phase === "failed" ? (
          <p className="sv-field-error" role="alert">
            {fund.detail}
          </p>
        ) : (
          <div style={{ marginTop: 10 }}>
            <Button
              variant="primary"
              loading={fund.phase === "pending"}
              onClick={() => void requestFunds()}
            >
              Request test funds
            </Button>
            {fund.phase === "pending" ? (
              <p className="app-note">
                Waiting on the Canton DevNet tap — this is a real submission and
                can take a moment.
              </p>
            ) : null}
          </div>
        )}
      </div>
      <div className="app-head-actions" style={{ marginTop: 14 }}>
        <Button variant="primary" onClick={onDone}>
          Enter the marketplace
        </Button>
      </div>
    </div>
  );
}
