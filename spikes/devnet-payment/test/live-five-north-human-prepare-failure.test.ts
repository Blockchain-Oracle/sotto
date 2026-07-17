import { expect, it } from "vitest";
import { CloudflareQuickTunnelRateLimitError } from "../src/cloudflare-quick-tunnel.js";
import { projectLiveFiveNorthHumanPrepareFailure } from "../src/live-five-north-human-prepare-failure.js";

const GENERIC = "Five North human read-only preparation failed";

it("projects the typed provider rate limit without raw process output", () => {
  expect(
    projectLiveFiveNorthHumanPrepareFailure(
      new CloudflareQuickTunnelRateLimitError(),
    ),
  ).toBe(`${GENERIC}: provider-tunnel-rate-limited`);
});

it("does not expose untyped error messages", () => {
  const projected = projectLiveFiveNorthHumanPrepareFailure(
    new Error("private URL token and prepared bytes"),
  );

  expect(projected).toBe(GENERIC);
  expect(projected).not.toContain("private");
  expect(projected).not.toContain("prepared bytes");
});

it("does not invoke hostile Proxy prototype traps", () => {
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error("private proxy trap detail");
      },
    },
  );

  expect(() => projectLiveFiveNorthHumanPrepareFailure(hostile)).not.toThrow();
  expect(projectLiveFiveNorthHumanPrepareFailure(hostile)).toBe(GENERIC);
});

it("does not accept a forged rate-limit prototype", () => {
  const forged = Object.create(CloudflareQuickTunnelRateLimitError.prototype);

  expect(projectLiveFiveNorthHumanPrepareFailure(forged)).toBe(GENERIC);
});
