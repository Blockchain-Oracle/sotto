"use client";

import { useState } from "react";

import { Button, CodeBlock, Field, Input } from "../ui";
import { apiRequest, describeFailure } from "../../lib/api";
import { useSession } from "../../lib/session";

type Challenge = Readonly<{
  challenge: Readonly<{ challengeId: string; expiresAt: string }> &
    Readonly<Record<string, unknown>>;
  instruction: string;
}>;

/**
 * External party path (S29): request a one-use challenge for a party you
 * already control, sign its exact JSON serialization with the party's
 * Ed25519 key outside the browser, then verify. This signature does not
 * move funds.
 */
export function ExternalPath({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const session = useSession();
  const [partyId, setPartyId] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [signature, setSignature] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestChallenge = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<Challenge>("/v1/session/challenge", {
        method: "POST",
        body: { partyId: partyId.trim() },
      });
      setChallenge(result);
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (challenge === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{
        partyId: string;
        session: { expiresAt: string };
      }>("/v1/session/verify", {
        method: "POST",
        body: {
          challengeId: challenge.challenge.challengeId,
          signature: signature.trim(),
          publicKeyBase64: publicKey.trim(),
          fingerprint: fingerprint.trim(),
        },
      });
      session.established({
        partyId: result.partyId,
        walletLabel: "External party",
        walletId: null,
        walletUrl: null,
        fingerprint: fingerprint.trim() || null,
        expiresAt: result.session.expiresAt,
      });
      onDone();
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setBusy(false);
    }
  };

  if (challenge === null) {
    return (
      <div>
        <Field
          label="Canton party ID"
          htmlFor="external-party"
          hint="hint::1220… — the party you can sign for."
          {...(error === null ? {} : { error })}
        >
          <Input
            id="external-party"
            mono
            value={partyId}
            onChange={(event) => setPartyId(event.target.value)}
            placeholder="sotto-owner::1220…"
          />
        </Field>
        <div className="app-head-actions" style={{ marginTop: 14 }}>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={partyId.trim() === ""}
            onClick={() => void requestChallenge()}
          >
            Request challenge
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CodeBlock
        label="CHALLENGE — sign this exact JSON"
        code={JSON.stringify(challenge.challenge)}
      />
      <p className="app-note">
        {challenge.instruction} This signature does not move funds.
      </p>
      <Field label="Signature (base64)" htmlFor="external-signature">
        <Input
          id="external-signature"
          mono
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
        />
      </Field>
      <Field label="Public key (base64)" htmlFor="external-key">
        <Input
          id="external-key"
          mono
          value={publicKey}
          onChange={(event) => setPublicKey(event.target.value)}
        />
      </Field>
      <Field
        label="Key fingerprint"
        htmlFor="external-fingerprint"
        {...(error === null ? {} : { error })}
      >
        <Input
          id="external-fingerprint"
          mono
          value={fingerprint}
          onChange={(event) => setFingerprint(event.target.value)}
        />
      </Field>
      <div className="app-head-actions" style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => setChallenge(null)}>
          Back
        </Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={
            signature.trim() === "" ||
            publicKey.trim() === "" ||
            fingerprint.trim() === ""
          }
          onClick={() => void verify()}
        >
          Verify party control
        </Button>
      </div>
    </div>
  );
}
