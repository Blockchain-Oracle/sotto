// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Veil } from "../src/primitives/veil.js";

afterEach(cleanup);

describe("Veil", () => {
  it("shows the exact reason and never renders withheld content", () => {
    const { container } = render(
      <Veil reason="Private resource context">
        <span>secret payload</span>
      </Veil>,
    );
    expect(container.textContent).toContain("Private resource context");
    expect(container.textContent).not.toContain("secret payload");
  });

  it("renders children plainly for the authorized reader", () => {
    const { container } = render(
      <Veil reason="Private resource context" veiled={false}>
        <span>quote 1.3712</span>
      </Veil>,
    );
    expect(container.textContent).toBe("quote 1.3712");
    expect(container.querySelector(".sv-veil")).toBeNull();
  });
});
