/**
 * state-chip — paired settlement/delivery pills (DESIGN.md §2, §5).
 *
 * Settlement and delivery are separate outcomes and never merge into a
 * generic "Success". Verde is settlement money-truth ONLY: a solid verde
 * pill is earned by a real Canton update, nothing else. State is never
 * color-only — every pill carries a label and a shape marker (double bar,
 * dot, hollow ring, or bar).
 */
export type SettlementOutcome = "pending" | "settled" | "failed";
export type DeliveryOutcome = "pending" | "delivered" | "failed";

export type ChipTone = "verde" | "ametista" | "ambra" | "rosso" | "neutral";
export type ChipShape = "double-bar" | "dot" | "ring" | "bar";

export interface ChipState {
  label: string;
  tone: ChipTone;
  hollow: boolean;
  shape: ChipShape;
}

export interface ChipPair {
  settlement: ChipState;
  delivery: ChipState;
}

/** Maps the two real outcomes onto the paired pills. Never says "Success". */
export function pairStateChips(
  settlement: SettlementOutcome,
  delivery: DeliveryOutcome,
): ChipPair {
  const settlementChip: ChipState =
    settlement === "settled"
      ? { label: "Settled", tone: "verde", hollow: false, shape: "double-bar" }
      : settlement === "failed"
        ? {
            label: "Settlement failed",
            tone: "rosso",
            hollow: false,
            shape: "bar",
          }
        : {
            label: "Awaiting settlement",
            tone: "neutral",
            hollow: true,
            shape: "ring",
          };
  const deliveryChip: ChipState =
    delivery === "delivered"
      ? { label: "Delivered", tone: "ametista", hollow: false, shape: "dot" }
      : delivery === "failed"
        ? {
            label: "Delivery failed",
            tone: "rosso",
            hollow: false,
            shape: "bar",
          }
        : {
            label: "Delivery pending",
            tone: "ametista",
            hollow: true,
            shape: "ring",
          };
  return { settlement: settlementChip, delivery: deliveryChip };
}

export function StateChip({ state }: { state: ChipState }) {
  return (
    <span
      className="sv-chip"
      data-tone={state.tone}
      data-hollow={state.hollow ? "true" : undefined}
    >
      <span
        className="sv-chip-shape"
        data-shape={state.shape}
        aria-hidden="true"
      >
        {state.shape === "double-bar" ? (
          <>
            <span className="sv-chip-bar" />
            <span className="sv-chip-bar sv-chip-bar-thick" />
          </>
        ) : null}
      </span>
      {state.label}
    </span>
  );
}

export interface StateChipPairProps {
  settlement: SettlementOutcome;
  delivery: DeliveryOutcome;
  className?: string;
}

/** The paired pills: settlement first, delivery second, never merged. */
export function StateChipPair({
  settlement,
  delivery,
  className,
}: StateChipPairProps) {
  const pair = pairStateChips(settlement, delivery);
  return (
    <span className={["sv-chip-pair", className].filter(Boolean).join(" ")}>
      <StateChip state={pair.settlement} />
      <StateChip state={pair.delivery} />
    </span>
  );
}
