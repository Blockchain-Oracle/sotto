"use client";

import type { ReactNode } from "react";

import { Veil, formatAmount, truncateParty } from "@sotto/ui";

import { humanPurchase, synchronizerId } from "../lib/evidence";

const REDACTED = "Redacted in the public evidence bundle";

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="site-proposal-row">
      <dt>{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The approval moment, engraved. Every field below is one the isolated
 * DevNet wallet actually displayed before the proven July 17 human-wallet
 * purchase (docs/architecture/devnet-spike-result.md). Fields the tracked
 * evidence bundle redacts stay veiled here too.
 */
export function Mechanic() {
  return (
    <section className="site-section" id="mechanic">
      <p className="site-kicker">The mechanic</p>
      <h2 className="site-h2">One exact call, approved in your wallet.</h2>
      <p className="site-prose">
        Sotto never holds the payer key and never receives payer authority. It
        prepares one transaction, verifies the complete effects and the official
        Canton hash, and hands the wallet an exact summary — the summary the
        isolated wallet displayed before the proven DevNet purchase:
      </p>
      <dl className="site-proposal">
        <Row name="Method">{humanPurchase.method}</Row>
        <Row name="Canonical URL">
          <Veil reason={REDACTED} minHeight={28} />
        </Row>
        <Row name="Recipient party">
          <Veil reason={REDACTED} minHeight={28} />
        </Row>
        <Row name="Network">{humanPurchase.networkLabel}</Row>
        <Row name="Synchronizer">{truncateParty(synchronizerId)}</Row>
        <Row name="Package">
          {humanPurchase.packageName} {humanPurchase.packageVersion}
        </Row>
        <Row name="Principal">
          {formatAmount(humanPurchase.amountCantonCoin, "CC")}
        </Row>
        <Row name="Fee ceiling">
          {formatAmount(humanPurchase.feeCeilingCantonCoin, "CC")}
        </Row>
        <Row name="Total-debit ceiling">
          {formatAmount(humanPurchase.totalDebitCeilingCantonCoin, "CC")}
        </Row>
        <Row name="Expiry">
          <Veil reason={REDACTED} minHeight={28} />
        </Row>
      </dl>
      <p className="site-mechanic-line">
        You approve the exact call. Nothing else can be spent.
      </p>
      <p className="site-footnote">
        Amounts are CC test value on DevNet. The signature authorizes only this
        prepared transaction, bounded by its total-debit ceiling.
      </p>
    </section>
  );
}
