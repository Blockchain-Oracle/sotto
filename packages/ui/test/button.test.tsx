// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "../src/primitives/button.js";

afterEach(cleanup);

describe("Button loading state", () => {
  it("keeps the label in the layout so width never shifts", () => {
    const { getByRole } = render(<Button loading>Prepare call</Button>);
    const button = getByRole("button");
    const label = button.querySelector(".sv-btn-label");
    expect(label?.textContent).toBe("Prepare call");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.querySelector(".sv-btn-wait")).not.toBeNull();
  });

  it("renders no wait overlay when idle", () => {
    const { getByRole } = render(<Button>Prepare call</Button>);
    const button = getByRole("button");
    expect(button.querySelector(".sv-btn-wait")).toBeNull();
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});
