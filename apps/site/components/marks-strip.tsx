"use client";

import { CantonMark } from "@sotto/ui";

import cantonBlack from "@sotto/ui/marks/assets/canton-logo-black.svg";
import cantonWhite from "@sotto/ui/marks/assets/canton-logo-white.svg";

/**
 * One official mark, quietly. The Canton lockup is the vendored, unmodified
 * official asset (packages/ui/ASSET-MANIFEST.md governs it; attribution is
 * in the footer). Settlement runs on Canton Five North DevNet — nothing
 * else is claimed here.
 */
export function MarksStrip() {
  return (
    <section className="site-marks" aria-label="Settlement network">
      <CantonMark
        src={cantonBlack.src}
        srcDark={cantonWhite.src}
        devnet
        height={22}
      />
      <span className="site-marks-label">Settles on Canton, over x402.</span>
    </section>
  );
}
