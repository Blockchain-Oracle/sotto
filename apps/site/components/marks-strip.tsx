"use client";

import { CantonMark } from "@sotto/ui";

import cantonBlack from "@sotto/ui/marks/assets/canton-logo-black.svg";
import cantonWhite from "@sotto/ui/marks/assets/canton-logo-white.svg";

/**
 * Official marks only. The Canton lockup is the vendored, unmodified
 * official asset (packages/ui/ASSET-MANIFEST.md governs it; attribution is
 * in the footer). x402, HTTP, and MCP have no official logomarks here, so
 * they appear as typographic tags — nothing is invented.
 */
export function MarksStrip() {
  return (
    <section className="site-marks" aria-label="Protocols and network">
      <CantonMark
        src={cantonBlack.src}
        srcDark={cantonWhite.src}
        devnet
        height={22}
      />
      <span className="site-marks-rule" aria-hidden="true" />
      <span className="site-tag">x402 v2</span>
      <span className="site-tag">HTTP 402</span>
      <span className="site-tag">MCP</span>
    </section>
  );
}
