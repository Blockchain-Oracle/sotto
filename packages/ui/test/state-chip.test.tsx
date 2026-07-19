// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  StateChipPair,
  pairStateChips,
  type DeliveryOutcome,
  type SettlementOutcome,
} from "../src/primitives/state-chip.js";

afterEach(cleanup);

const settlements: SettlementOutcome[] = ["pending", "settled", "failed"];
const deliveries: DeliveryOutcome[] = ["pending", "delivered", "failed"];

describe("pairStateChips", () => {
  it("renders settled-undelivered as solid verde plus hollow ametista", () => {
    const pair = pairStateChips("settled", "pending");
    expect(pair.settlement).toMatchObject({
      tone: "verde",
      hollow: false,
      shape: "double-bar",
    });
    expect(pair.delivery).toMatchObject({ tone: "ametista", hollow: true });
  });

  it("earns verde only through settlement", () => {
    for (const settlement of settlements) {
      for (const delivery of deliveries) {
        const pair = pairStateChips(settlement, delivery);
        expect(pair.delivery.tone).not.toBe("verde");
        if (settlement !== "settled") {
          expect(pair.settlement.tone).not.toBe("verde");
        }
      }
    }
  });

  it("never merges the two outcomes into a generic Success", () => {
    for (const settlement of settlements) {
      for (const delivery of deliveries) {
        const pair = pairStateChips(settlement, delivery);
        expect(pair.settlement.label.toLowerCase()).not.toContain("success");
        expect(pair.delivery.label.toLowerCase()).not.toContain("success");
        expect(pair.settlement.label).not.toBe(pair.delivery.label);
      }
    }
  });
});

describe("StateChipPair", () => {
  it("always renders both pills with label plus shape", () => {
    const { container } = render(
      <StateChipPair settlement="settled" delivery="failed" />,
    );
    const chips = container.querySelectorAll(".sv-chip");
    expect(chips.length).toBe(2);
    expect(chips[0]?.textContent).toContain("Settled");
    expect(chips[0]?.querySelector('[data-shape="double-bar"]')).not.toBeNull();
    expect(chips[1]?.textContent).toContain("Delivery failed");
    expect(chips[1]?.querySelector('[data-shape="bar"]')).not.toBeNull();
  });
});
