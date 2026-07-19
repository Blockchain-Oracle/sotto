// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Deadline } from "../src/primitives/deadline.js";

afterEach(cleanup);

const NOW = new Date("2026-07-19T14:00:00Z");
const fixedClock = () => NOW;

describe("Deadline with a fixed injected clock", () => {
  it("renders the remaining time against the real expiry", () => {
    const { container } = render(
      <Deadline
        label="Execute before"
        until={new Date("2026-07-19T14:04:12Z")}
        now={fixedClock}
      />,
    );
    expect(container.textContent).toContain("Execute before");
    expect(container.textContent).toContain("4m 12s");
    expect(
      container.querySelector(".sv-deadline")?.getAttribute("data-state"),
    ).toBe("counting");
  });

  it("enters the ambra expiring state under the threshold", () => {
    const { container } = render(
      <Deadline
        until={new Date("2026-07-19T14:00:42Z")}
        now={fixedClock}
        expiringUnderSeconds={60}
      />,
    );
    expect(
      container.querySelector(".sv-deadline")?.getAttribute("data-state"),
    ).toBe("expiring");
    expect(container.textContent).toContain("42s");
  });

  it("renders Expired after the boundary passes", () => {
    const { container } = render(
      <Deadline until={new Date("2026-07-19T13:59:59Z")} now={fixedClock} />,
    );
    expect(
      container.querySelector(".sv-deadline")?.getAttribute("data-state"),
    ).toBe("expired");
    expect(container.textContent).toContain("Expired");
  });
});
