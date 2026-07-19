"use client";

import { Veil, truncateUpdateId } from "@sotto/ui";

import { externalAgentPurchase, humanPurchase } from "../lib/evidence";

/**
 * The three readers, from the recorded Five North visibility result:
 * the owner reads the full receipt; the provider reads only its
 * settlement/delivery reference; the public sees the Canton Coin
 * settlement while the outsider ACS read found zero purchase contexts
 * and the direct transaction lookup returned 404.
 */
export function Privacy() {
  return (
    <section className="site-section" id="privacy">
      <p className="site-kicker">Privacy doctrine</p>
      <h2 className="site-h2">Three readers, three views.</h2>
      <div className="site-readers">
        <article className="site-reader">
          <h3 className="site-reader-name">The owner</h3>
          <dl className="site-reader-fields">
            <dt>Journal</dt>
            <dd>{humanPurchase.journalStages.join(" → ")}</dd>
            <dt>Settlement update</dt>
            <dd className="site-mono">
              {truncateUpdateId(humanPurchase.updateId)}
            </dd>
            <dt>Paid response</dt>
            <dd>
              HTTP {humanPurchase.deliveryStatus} ·{" "}
              {humanPurchase.deliveryBodyBytes} bytes, retained as hash
            </dd>
          </dl>
          <p className="site-reader-note">Reads the full receipt.</p>
        </article>
        <article className="site-reader">
          <h3 className="site-reader-name">The provider</h3>
          <dl className="site-reader-fields">
            <dt>Settlement reference</dt>
            <dd className="site-mono">
              {truncateUpdateId(humanPurchase.updateId)} ·{" "}
              {humanPurchase.amountCantonCoin} CC holding
            </dd>
            <dt>Purchase context</dt>
            <dd>
              <Veil reason="Private resource context" minHeight={28} />
            </dd>
          </dl>
          <p className="site-reader-note">
            Reads only its settlement and delivery reference.
          </p>
        </article>
        <article className="site-reader">
          <h3 className="site-reader-name">The public</h3>
          <dl className="site-reader-fields">
            <dt>Lighthouse explorer</dt>
            <dd className="site-mono">
              HTTP {externalAgentPurchase.explorerHttpStatus} for{" "}
              {truncateUpdateId(externalAgentPurchase.updateId)}
            </dd>
            <dt>Purchase context</dt>
            <dd>
              <Veil reason="Party-scoped Daml contract" minHeight={28} />
            </dd>
          </dl>
          <p className="site-reader-note">
            The outsider ACS read found {externalAgentPurchase.outsiderContexts}{" "}
            contexts; the direct transaction lookup returned 404.
          </p>
        </article>
      </div>
    </section>
  );
}
