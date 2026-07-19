// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CopyChip } from "../src/primitives/copy-chip.js";

afterEach(cleanup);

const OWNER =
  "sotto-owner::1220b6c4e9d10a7f45c2388d915e04a7c31fb02976aa41c58890d2731eab8a91";

let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (value: string) => {
        written.push(value);
        return Promise.resolve();
      },
    },
  });
});

describe("CopyChip", () => {
  it("displays the truncated party but copies the FULL value", async () => {
    const { getByRole } = render(<CopyChip value={OWNER} kind="party" />);
    const chip = getByRole("button");
    expect(chip.querySelector(".sv-copy-value")?.textContent).toBe(
      "sotto-owner::1220…b8a91",
    );
    fireEvent.click(chip);
    await Promise.resolve();
    expect(written).toEqual([OWNER]);
  });

  it("truncates update ids first-8 plus last-4", () => {
    const { container } = render(
      <CopyChip
        value="1220a91e44b1c0a5d8e2f7639bd04c1855aa0e2f91c47d83f2ab9640cbbe7c2f"
        kind="update"
      />,
    );
    expect(container.querySelector(".sv-copy-value")?.textContent).toBe(
      "1220a91e…7c2f",
    );
  });
});
