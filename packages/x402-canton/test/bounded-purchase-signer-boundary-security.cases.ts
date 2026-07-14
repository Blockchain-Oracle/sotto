import { describe, expect, it, vi } from "vitest";
import { signBoundedPurchase } from "../src/index.js";
import {
  expectZeroSigning,
  SIGNER_BOUNDARY_DIGEST,
  signerBoundaryFixture,
} from "./bounded-purchase-signer-boundary.fixtures.js";

export function registerSignerBoundarySecurityCases(): void {
  describe("zero-signing freshness hash claim and replay matrix", () => {
    it("rejects stale package selection before preparing or signing", async () => {
      const { dependencies, request } = await signerBoundaryFixture();
      vi.advanceTimersByTime(60_001);

      await expect(signBoundedPurchase(request, dependencies)).rejects.toThrow(
        /package.*stale/iu,
      );
      expect(dependencies.readPreparedPurchase).not.toHaveBeenCalled();
      expect(dependencies.signOpaque).not.toHaveBeenCalled();
    });

    it("rejects an expired prepared purchase with zero signing calls", async () => {
      const fixture = await signerBoundaryFixture();
      vi.setSystemTime(new Date(fixture.intent.challenge.executeBefore));

      await expect(
        signBoundedPurchase(fixture.request, fixture.dependencies),
      ).rejects.toThrow(/execution window/iu);
      expect(fixture.dependencies.signOpaque).not.toHaveBeenCalled();
    });

    it("rejects an official hash mismatch before claim or signing", async () => {
      await expectZeroSigning({
        officialDigest: new Uint8Array(SIGNER_BOUNDARY_DIGEST).fill(8),
      });
    });

    it("rejects a duplicate attempt claim with zero signing calls", async () => {
      await expectZeroSigning({ claimed: false });
    });

    it("rechecks expiry after the attempt claim before signing", async () => {
      const fixture = await signerBoundaryFixture({
        claimEffect: () =>
          vi.setSystemTime(new Date("2026-07-13T10:00:45.000Z")),
      });

      await expect(
        signBoundedPurchase(fixture.request, fixture.dependencies),
      ).rejects.toThrow(/execution window/iu);
      expect(fixture.dependencies.signOpaque).not.toHaveBeenCalled();
    });

    it("consumes the authenticated prepare request after one attempt", async () => {
      const fixture = await signerBoundaryFixture();
      await signBoundedPurchase(fixture.request, fixture.dependencies);

      await expect(
        signBoundedPurchase(fixture.request, fixture.dependencies),
      ).rejects.toThrow(/already claimed/iu);
      expect(fixture.dependencies.signOpaque).toHaveBeenCalledOnce();
    });
  });
}
