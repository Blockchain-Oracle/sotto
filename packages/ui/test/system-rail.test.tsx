// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SystemRail, type RailEvent } from "../src/primitives/system-rail.js";

afterEach(cleanup);

const t = (seconds: number): Date =>
  new Date(Date.UTC(2026, 6, 19, 14, 3, seconds));

function events(withSettlementAt: boolean): RailEvent[] {
  return [
    { key: "challenge", label: "402 challenge", at: t(0), kind: "mark" },
    withSettlementAt
      ? {
          key: "settlement",
          label: "Settlement",
          at: t(15),
          kind: "settlement",
        }
      : { key: "settlement", label: "Settlement", kind: "settlement" },
    { key: "delivery", label: "Delivery", kind: "pending" },
  ];
}

const soundedMarks = (container: HTMLElement) =>
  container.querySelectorAll(".sv-rail-mark.sv-sound");

describe("SystemRail one-shot gating", () => {
  it("never animates already-committed history on first mount", () => {
    const { container } = render(<SystemRail events={events(true)} />);
    expect(soundedMarks(container).length).toBe(0);
  });

  it("sounds exactly the event whose at is newly provided", () => {
    const { container, rerender } = render(
      <SystemRail events={events(false)} />,
    );
    expect(soundedMarks(container).length).toBe(0);

    rerender(<SystemRail events={events(true)} />);
    const sounded = soundedMarks(container);
    expect(sounded.length).toBe(1);
    expect(sounded[0]?.getAttribute("data-kind")).toBe("settlement");

    rerender(<SystemRail events={events(true)} />);
    expect(soundedMarks(container).length).toBe(0);
  });

  it("renders pending marks hollow and settlement as the double barline", () => {
    const { container } = render(<SystemRail events={events(true)} />);
    const pending = container.querySelector(
      '.sv-rail-mark[data-kind="pending"]',
    );
    expect(pending).not.toBeNull();
    const settlement = container.querySelector(
      '.sv-rail-mark[data-kind="settlement"]',
    );
    expect(settlement?.querySelectorAll(".sv-rail-bar").length).toBe(2);
  });

  it("renders committed events before pending ones", () => {
    const { container } = render(<SystemRail events={events(true)} />);
    const labels = [...container.querySelectorAll(".sv-rail-label")].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(["402 challenge", "Settlement", "Delivery"]);
  });
});
