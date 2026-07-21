"use client";

import { StateChip, pairStateChips } from "@sotto/ui";
import type { ChipState } from "@sotto/ui";

import { settledUndelivered } from "../lib/evidence";
import { CopyChip } from "./ui-client";

/** The recorded terminal state of the first human settlement (real). */
const undeliveredChip: ChipState = {
  label: "Undelivered",
  tone: "ametista",
  hollow: true,
  shape: "ring",
};

/**
 * "Settlement is never delivery." The paired chips below show the two
 * recorded outcomes of the July 17 human-wallet runs: the delivered
 * purchase, and the honest settled-undelivered predecessor that was never
 * replayed or relabeled (docs/architecture/devnet-spike-result.md).
 */
export function Honesty() {
  const delivered = pairStateChips("settled", "delivered");
  return (
    <section className="site-section" id="honesty">
      <p className="site-kicker">Honesty doctrine</p>
      <h2 className="site-h2">Settlement is never delivery.</h2>
      <div className="site-honesty-rows">
        <div className="site-honesty-row">
          <span className="sv-chip-pair">
            <StateChip state={delivered.settlement} />
            <StateChip state={delivered.delivery} />
          </span>
          <p>The proven human-wallet purchase: paid, then delivered.</p>
        </div>
        <div className="site-honesty-row">
          <span className="sv-chip-pair">
            <StateChip
              state={pairStateChips("settled", "pending").settlement}
            />
            <StateChip state={undeliveredChip} />
          </span>
          <p>
            Its predecessor settled at offset {settledUndelivered.offset} —
            update{" "}
            <CopyChip value={settledUndelivered.updateId} kind="update" /> — but
            the provider closed before delivery. It is recorded as{" "}
            <span className="site-mono">
              {settledUndelivered.recoveredStatus}
            </span>
            , not replayed and never relabeled.
          </p>
        </div>
      </div>
      <p className="site-prose">
        A Canton update moving Canton Coin and an HTTP response reaching the
        buyer are different facts, and Sotto refuses to merge them. That is what
        makes a Sotto receipt worth reading: the one time delivery failed, the
        record says so.
      </p>
    </section>
  );
}
