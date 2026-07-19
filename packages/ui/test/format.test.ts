import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatCountdown,
  formatRelative,
  formatUrl,
  formatUtc,
  formatUtcClock,
  truncateParty,
  truncateUpdateId,
} from "../src/format.js";

const FP = "12204af8d02be519c7708a41e6f3355640918d2b6c05579ee21d40bc8dcc397b";

describe("truncateParty", () => {
  it("keeps hint plus fingerprint first/last", () => {
    expect(truncateParty(`merchant-ctai::${FP}`)).toBe(
      "merchant-ctai::1220…c397b",
    );
  });

  it("keeps short fingerprints whole", () => {
    expect(truncateParty("sotto-owner::1220ab")).toBe("sotto-owner::1220ab");
  });

  it("truncates a bare fingerprint without a hint", () => {
    expect(truncateParty(FP)).toBe("1220…c397b");
  });
});

describe("truncateUpdateId", () => {
  it("keeps first-8 plus last-4", () => {
    expect(
      truncateUpdateId(
        "1220a91e44b1c0a5d8e2f7639bd04c1855aa0e2f91c47d83f2ab9640cbbe7c2f",
      ),
    ).toBe("1220a91e…7c2f");
  });

  it("keeps short ids whole", () => {
    expect(truncateUpdateId("1220a91e7c2f")).toBe("1220a91e7c2f");
  });
});

describe("formatAmount", () => {
  it("always carries the asset", () => {
    expect(formatAmount("0.25", "CC")).toBe("0.25 CC");
    expect(formatAmount(0.25, "CC")).toBe("0.25 CC");
  });
});

describe("formatUrl", () => {
  it("shows origin plus route", () => {
    expect(formatUrl("https://api.example.com/fx/usd-cad?key=1")).toBe(
      "https://api.example.com/fx/usd-cad",
    );
  });

  it("drops a bare trailing slash", () => {
    expect(formatUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
  });
});

describe("time formatting", () => {
  const t = new Date("2026-07-19T14:03:22Z");

  it("renders exact UTC for detail views", () => {
    expect(formatUtc(t)).toBe("2026-07-19 14:03:22 UTC");
    expect(formatUtcClock(t)).toBe("14:03:22");
  });

  it("renders relative time for lists", () => {
    const now = new Date("2026-07-19T14:04:00Z");
    expect(formatRelative(t, now)).toBe("38s ago");
    expect(formatRelative(new Date("2026-07-19T13:03:22Z"), now)).toBe(
      "1h ago",
    );
    expect(formatRelative(new Date("2026-07-16T14:03:22Z"), now)).toBe(
      "3d ago",
    );
  });

  it("renders countdown segments", () => {
    const now = new Date("2026-07-19T14:00:00Z");
    expect(formatCountdown(new Date("2026-07-19T14:00:42Z"), now)).toBe("42s");
    expect(formatCountdown(new Date("2026-07-19T14:04:12Z"), now)).toBe(
      "4m 12s",
    );
    expect(formatCountdown(new Date("2026-07-19T16:04:00Z"), now)).toBe(
      "2h 04m",
    );
    expect(formatCountdown(new Date("2026-07-19T13:59:59Z"), now)).toBe(
      "expired",
    );
  });
});
