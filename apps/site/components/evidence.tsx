"use client";

import {
  explorerHost,
  externalAgentPurchase,
  humanPurchase,
  network,
  participant,
  sottoControlPackageId,
  sottoControlVersion,
  synchronizerId,
} from "../lib/evidence";
import { CopyChip, DynamicMarking, SottoMark } from "./ui-client";

/**
 * Colophon: recorded facts only, from the tracked evidence bundle. The
 * bundle names the Lighthouse host but records no public URL pattern, so
 * the explorer is named rather than linked.
 */
export function EvidenceColophon() {
  return (
    <section className="site-section site-colophon" id="evidence">
      <p className="site-kicker">Evidence</p>
      <h2 className="site-h2">What the record says.</h2>
      <dl className="site-facts">
        <div className="site-fact">
          <dt>Network</dt>
          <dd>
            {network} · {participant}
          </dd>
        </div>
        <div className="site-fact">
          <dt>Synchronizer</dt>
          <dd>
            <CopyChip value={synchronizerId} kind="party" />
          </dd>
        </div>
        <div className="site-fact">
          <dt>sotto-control {sottoControlVersion}</dt>
          <dd>
            <CopyChip value={sottoControlPackageId} kind="update" />
          </dd>
        </div>
        <div className="site-fact">
          <dt>Agent settlement, publicly indexed</dt>
          <dd>
            <CopyChip value={externalAgentPurchase.updateId} kind="update" /> ·
            offset {externalAgentPurchase.offset} · anonymous {explorerHost}{" "}
            lookup returned HTTP {externalAgentPurchase.explorerHttpStatus}
          </dd>
        </div>
        <div className="site-fact">
          <dt>Human-wallet settlement, delivered</dt>
          <dd>
            <CopyChip value={humanPurchase.updateId} kind="update" /> · offset{" "}
            {humanPurchase.offset} · explorer indexing was still pending at the
            last recheck
          </dd>
        </div>
      </dl>
      <p className="site-footnote">
        Full redacted record: docs/architecture/devnet-spike-evidence.json in
        the repository. DevNet only — no production, mainnet, or coverage claim
        is made here.
      </p>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <SottoMark size={24} />
        <DynamicMarking size={18} className="site-footer-marking" />
      </div>
      <nav className="site-footer-nav" aria-label="Footer">
        <a href="https://app.usesotto.xyz">Marketplace</a>
        <a href="https://docs.usesotto.xyz">Docs</a>
        <a href="https://github.com/Blockchain-Oracle/sotto-x402">Source</a>
      </nav>
      <p className="site-footer-legal">
        Apache-2.0. Canton is a registered trademark of Digital Asset
        (Switzerland) GmbH. Digital Asset is not affiliated with, and has not
        sponsored or endorsed, this product.
      </p>
    </footer>
  );
}
