import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CopyChip,
  StateChipPair,
  SystemRail,
  formatAmount,
  type RailEvent,
} from "../../src/index.js";
import {
  SPECIMEN_MERCHANT_PARTY,
  SPECIMEN_PRICE,
  at,
} from "../specimen-data.js";

function midPurchase(): RailEvent[] {
  return [
    { key: "challenge", label: "402 challenge", at: at(0), kind: "mark" },
    { key: "prepared", label: "Payment prepared", at: at(9), kind: "mark" },
    { key: "settlement", label: "Settlement", kind: "settlement" },
    { key: "delivery", label: "Delivery", kind: "pending" },
  ];
}

export function RailSpecimens() {
  const [events, setEvents] = useState<RailEvent[]>(midPurchase);
  const landSettlement = () => {
    setEvents((current) =>
      current.map((event) =>
        event.key === "settlement" && event.at === undefined
          ? { ...event, at: new Date() }
          : event,
      ),
    );
  };

  return (
    <section className="g-section">
      <h2>system-rail · SPECIMEN</h2>
      <div className="g-stack">
        <Card title="Mid-purchase" aside={<Badge tone="ambra">Specimen</Badge>}>
          <SystemRail events={events} label="Purchase lifecycle (specimen)" />
          <div className="g-row" style={{ marginTop: 10 }}>
            <Button onClick={landSettlement}>
              Land settlement event (specimen)
            </Button>
            <Button variant="ghost" onClick={() => setEvents(midPurchase())}>
              Reset
            </Button>
          </div>
        </Card>
        <Card
          title="Settled, delivery failed"
          aside={<StateChipPair settlement="settled" delivery="failed" />}
        >
          <SystemRail
            label="Settled purchase with failed delivery (specimen)"
            events={[
              {
                key: "challenge",
                label: "402 challenge",
                at: at(0),
                kind: "mark",
              },
              {
                key: "prepared",
                label: "Payment prepared",
                at: at(9),
                kind: "mark",
              },
              {
                key: "settlement",
                label: "Settlement",
                at: at(15),
                kind: "settlement",
              },
              {
                key: "delivery",
                label: "Delivery failed",
                at: at(21),
                kind: "mark",
              },
            ]}
          />
        </Card>
        <Card title="Marketplace row">
          <div className="g-row">
            <span style={{ fontWeight: 600 }}>fx/usd-cad · verified</span>
            <span className="g-voice-mono">
              {formatAmount(SPECIMEN_PRICE.value, SPECIMEN_PRICE.asset)}
            </span>
            <CopyChip value={SPECIMEN_MERCHANT_PARTY} kind="party" />
            <StateChipPair settlement="settled" delivery="delivered" />
          </div>
        </Card>
      </div>
    </section>
  );
}
